import { ethers } from 'ethers';
import { AssetType, ClobClient, getContractConfig } from '@polymarket/clob-client';
import { SignatureType } from '@polymarket/order-utils';
import { ENV } from '../config/env';

const PROXY_WALLET = ENV.PROXY_WALLET;
const PRIVATE_KEY = ENV.PRIVATE_KEY;
const RPC_URL = ENV.RPC_URL;
const USDC_CONTRACT_ADDRESS = ENV.USDC_CONTRACT_ADDRESS;
const CONDITIONAL_TOKEN_ADDRESS = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';
const CLOB_HTTP_URL = ENV.CLOB_HTTP_URL;
const POLYGON_CHAIN_ID = 137;
const POLYMARKET_EXCHANGE = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';
const POLYMARKET_EXCHANGE_LOWER = POLYMARKET_EXCHANGE.toLowerCase();
const NEG_RISK_EXCHANGE = '0xC5d563A36AE78145C45a50134d48A1215220f80a';
const NEG_RISK_EXCHANGE_LOWER = NEG_RISK_EXCHANGE.toLowerCase();
const NEG_RISK_ADAPTER = '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296';
const NEG_RISK_ADAPTER_LOWER = NEG_RISK_ADAPTER.toLowerCase();
const POLYMARKET_COLLATERAL = getContractConfig(POLYGON_CHAIN_ID).collateral;
const POLYMARKET_COLLATERAL_LOWER = POLYMARKET_COLLATERAL.toLowerCase();
const NATIVE_USDC_ADDRESS = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';
const NATIVE_USDC_LOWER = NATIVE_USDC_ADDRESS.toLowerCase();

// USDC ABI (only the functions we need)
const USDC_ABI = [
    'function balanceOf(address owner) view returns (uint256)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function approve(address spender, uint256 amount) returns (bool)',
    'function decimals() view returns (uint8)',
];

// CTF Contract ABI (only the functions we need)
const CTF_ABI = [
    'function setApprovalForAll(address collateralToken, bool approved) external',
    'function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] calldata indexSets) external',
    'function balanceOf(address owner, uint256 tokenId) external view returns (uint256)',
];

const buildClobClient = async (provider: ethers.providers.JsonRpcProvider): Promise<ClobClient> => {
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const code = await provider.getCode(PROXY_WALLET);
    const isProxySafe = code !== '0x';
    const signatureType = isProxySafe ? SignatureType.POLY_GNOSIS_SAFE : SignatureType.EOA;
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;
    console.log = function () {};
    console.error = function () {};

    const initialClient = new ClobClient(
        CLOB_HTTP_URL,
        POLYGON_CHAIN_ID,
        wallet,
        undefined,
        signatureType,
        isProxySafe ? PROXY_WALLET : undefined
    );

    let creds;
    let createWarning: string | undefined;
    let deriveWarning: string | undefined;
    try {
        try {
            creds = await initialClient.createApiKey();
        } catch (createError: any) {
            const msg = createError?.response?.data?.error || createError?.message;
            createWarning = `⚠️  Unable to create new API key${msg ? `: ${msg}` : ''}`;
        }

        if (!creds?.key) {
            try {
                creds = await initialClient.deriveApiKey();
            } catch (deriveError: any) {
                const msg = deriveError?.response?.data?.error || deriveError?.message;
                deriveWarning = `⚠️  Unable to derive API key${msg ? `: ${msg}` : ''}`;
            }
        }
    } finally {
        console.log = originalConsoleLog;
        console.error = originalConsoleError;
    }

    if (createWarning) {
        console.log(createWarning);
    }
    if (deriveWarning) {
        console.log(deriveWarning);
    }

    if (!creds?.key) {
        throw new Error('Failed to obtain Polymarket API credentials');
    }

    return new ClobClient(
        CLOB_HTTP_URL,
        POLYGON_CHAIN_ID,
        wallet,
        creds,
        signatureType,
        isProxySafe ? PROXY_WALLET : undefined
    );
};

const formatClobAmount = (raw: string, decimals: number): string => {
    try {
        return ethers.utils.formatUnits(raw, decimals);
    } catch {
        const numeric = parseFloat(raw);
        if (!Number.isFinite(numeric)) {
            return raw;
        }
        return numeric.toFixed(Math.min(decimals, 6));
    }
};

const syncPolymarketAllowanceCache = async (
    decimals: number,
    provider: ethers.providers.JsonRpcProvider
) => {
    try {
        console.log('🔄 Syncing Polymarket allowance cache...');
        const clobClient = await buildClobClient(provider);
        const updateParams = {
            asset_type: AssetType.COLLATERAL,
        } as const;

        const updateResult: any = await clobClient.updateBalanceAllowance(updateParams);
        if (updateResult && typeof updateResult === 'object' && 'error' in updateResult) {
            console.log(`⚠️  Polymarket cache update failed: ${updateResult.error}`);
            return;
        }
        if (updateResult === '' || updateResult === null || updateResult === undefined) {
            console.log('ℹ  Polymarket cache update acknowledged (empty response).');
        } else if (typeof updateResult !== 'object') {
            console.log(
                '⚠️  Polymarket cache update returned an unexpected response:',
                JSON.stringify(updateResult)
            );
        } else {
            console.log('ℹ  Polymarket cache update response:', JSON.stringify(updateResult));
        }

        const balanceResponse: any = await clobClient.getBalanceAllowance(updateParams);
        if (!balanceResponse || typeof balanceResponse !== 'object') {
            console.log(
                '⚠️  Unexpected response from Polymarket when fetching balance/allowance:',
                JSON.stringify(balanceResponse)
            );
            return;
        }

        if ('error' in balanceResponse) {
            console.log(
                `⚠️  Unable to fetch Polymarket balance/allowance: ${balanceResponse.error}`
            );
            return;
        }

        const { balance, allowance } = balanceResponse as {
            balance?: string;
            allowance?: string;
            allowances?: Record<string, string>;
        };
        let allowanceValue: string | undefined = allowance;
        if (!allowanceValue && balanceResponse.allowances) {
            for (const [address, value] of Object.entries(balanceResponse.allowances)) {
                if (
                    address.toLowerCase() === POLYMARKET_EXCHANGE_LOWER &&
                    typeof value === 'string'
                ) {
                    allowanceValue = value;
                    break;
                }
            }
        }

        if (balance === undefined || allowanceValue === undefined) {
            console.log(
                '⚠️  Polymarket did not provide balance/allowance data. Raw response:',
                JSON.stringify(balanceResponse)
            );
            return;
        }

        const syncedBalance = formatClobAmount(balance, decimals);
        const syncedAllowance = formatClobAmount(allowanceValue, decimals);
        console.log(`💾 Polymarket Recorded Balance: ${syncedBalance} USDC`);
        console.log(`💾 Polymarket Recorded Allowance: ${syncedAllowance} USDC\n`);
    } catch (syncError: any) {
        console.log(`⚠️  Unable to sync Polymarket cache: ${syncError?.message || syncError}`);
    }
};

async function checkAndSetAllowance() {
    console.log('🔍 Checking USDC balance and allowance...\n');

    // Connect to Polygon
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

    // Create USDC contract instance
    const usdcContract = new ethers.Contract(USDC_CONTRACT_ADDRESS, USDC_ABI, wallet);
    const conditionalContract = new ethers.Contract(CONDITIONAL_TOKEN_ADDRESS, CTF_ABI, wallet);

    await setAllowanceForContract(usdcContract, provider, wallet);
    await setAllowanceForCTFContract(conditionalContract, provider, wallet);
}

async function setAllowanceForContract(
    contract: ethers.Contract,
    provider: ethers.providers.JsonRpcProvider,
    wallet: ethers.Wallet
) {
    try {
        // Get USDC decimals
        const decimals = await contract.decimals();
        console.log(`💵 USDC Decimals: ${decimals}`);

        const usesPolymarketCollateral =
            USDC_CONTRACT_ADDRESS.toLowerCase() === POLYMARKET_COLLATERAL_LOWER;

        // Local token balance & allowance (whatever is configured in .env)
        const localBalance = await contract.balanceOf(PROXY_WALLET);
        const localMainAllowance = await contract.allowance(PROXY_WALLET, POLYMARKET_EXCHANGE);
        const localNegRiskAllowance = await contract.allowance(PROXY_WALLET, NEG_RISK_EXCHANGE);
        const localNegRiskAdapterAllowance = await contract.allowance(
            PROXY_WALLET,
            NEG_RISK_ADAPTER
        );
        const localBalanceFormatted = ethers.utils.formatUnits(localBalance, decimals);
        const localMainAllowanceFormatted = ethers.utils.formatUnits(localMainAllowance, decimals);
        const localNegRiskAllowanceFormatted = ethers.utils.formatUnits(
            localNegRiskAllowance,
            decimals
        );
        const localNegRiskAdapterAllowanceFormatted = ethers.utils.formatUnits(
            localNegRiskAdapterAllowance,
            decimals
        );

        console.log(
            `💰 Your USDC Balance (${USDC_CONTRACT_ADDRESS}): ${localBalanceFormatted} USDC`
        );
        console.log(
            `✅ Current Main Allowance (${USDC_CONTRACT_ADDRESS}): ${localMainAllowanceFormatted} USDC`
        );
        console.log(
            `✅ Current Neg Risk Allowance (${USDC_CONTRACT_ADDRESS}): ${localNegRiskAllowanceFormatted} USDC`
        );
        console.log(
            `✅ Current Neg Risk Adapter Allowance (${USDC_CONTRACT_ADDRESS}): ${localNegRiskAdapterAllowanceFormatted} USDC`
        );
        console.log(`📍 Polymarket Exchange: ${POLYMARKET_EXCHANGE}\n`);

        if (USDC_CONTRACT_ADDRESS.toLowerCase() !== NATIVE_USDC_LOWER) {
            try {
                const nativeContract = new ethers.Contract(NATIVE_USDC_ADDRESS, USDC_ABI, wallet);
                const nativeDecimals = await nativeContract.decimals();
                const nativeBalance = await nativeContract.balanceOf(PROXY_WALLET);
                if (!nativeBalance.isZero()) {
                    const nativeFormatted = ethers.utils.formatUnits(nativeBalance, nativeDecimals);
                    console.log('ℹ️  Detected native USDC (Polygon PoS) balance:');
                    console.log(`    ${nativeFormatted} tokens at ${NATIVE_USDC_ADDRESS}`);
                    console.log(
                        '    Polymarket does not recognize this token. Swap to USDC.e (0x2791...) to trade.\n'
                    );
                }
            } catch (nativeError) {
                console.log(`⚠️  Unable to check native USDC balance: ${nativeError}`);
            }
        }

        // Determine the contract Polymarket actually reads from (USDC.e)
        const polymarketContract = usesPolymarketCollateral
            ? contract
            : new ethers.Contract(POLYMARKET_COLLATERAL, USDC_ABI, wallet);
        const polymarketDecimals = usesPolymarketCollateral
            ? decimals
            : await polymarketContract.decimals();
        const polymarketBalance = usesPolymarketCollateral
            ? localBalance
            : await polymarketContract.balanceOf(PROXY_WALLET);
        const polymarketMainAllowance = usesPolymarketCollateral
            ? localMainAllowance
            : await polymarketContract.allowance(PROXY_WALLET, POLYMARKET_EXCHANGE);
        const polymarketNegRiskAllowance = usesPolymarketCollateral
            ? localNegRiskAllowance
            : await polymarketContract.allowance(PROXY_WALLET, NEG_RISK_EXCHANGE);
        const polymarketNegRiskAdapterAllowance = usesPolymarketCollateral
            ? localNegRiskAdapterAllowance
            : await polymarketContract.allowance(PROXY_WALLET, NEG_RISK_ADAPTER);

        if (!usesPolymarketCollateral) {
            const polymarketBalanceFormatted = ethers.utils.formatUnits(
                polymarketBalance,
                polymarketDecimals
            );
            const polymarketMainAllowanceFormatted = ethers.utils.formatUnits(
                polymarketMainAllowance,
                polymarketDecimals
            );
            const polymarketNegRiskAllowanceFormatted = ethers.utils.formatUnits(
                polymarketNegRiskAllowance,
                polymarketDecimals
            );
            const polymarketNegRiskAdapterAllowanceFormatted = ethers.utils.formatUnits(
                polymarketNegRiskAdapterAllowance,
                polymarketDecimals
            );
            console.log('⚠️  Polymarket collateral token is USDC.e (bridged) at address');
            console.log(`    ${POLYMARKET_COLLATERAL}`);
            console.log(`⚠️  Polymarket-tracked USDC balance: ${polymarketBalanceFormatted} USDC`);
            console.log(
                `⚠️  Polymarket-tracked main allowance: ${polymarketMainAllowanceFormatted} USDC\n`
            );
            console.log(
                `⚠️  Polymarket-tracked neg risk allowance: ${polymarketNegRiskAllowanceFormatted} USDC\n`
            );
            console.log(
                `⚠️  Polymarket-tracked neg risk adapter allowance: ${polymarketNegRiskAdapterAllowanceFormatted} USDC\n`
            );
            console.log(
                '👉  Swap native USDC to USDC.e or update your .env to point at the collateral token before trading.\n'
            );
        }

        if (
            polymarketMainAllowance.lt(polymarketBalance) ||
            polymarketMainAllowance.isZero() ||
            polymarketNegRiskAllowance.lt(polymarketBalance) ||
            polymarketNegRiskAllowance.isZero() ||
            polymarketNegRiskAdapterAllowance.lt(polymarketBalance) ||
            polymarketNegRiskAdapterAllowance.isZero()
        ) {
            console.log('⚠️ Some of allowances Allowance is insufficient or zero!');
            console.log('📝 Setting unlimited allowance for Polymarket...\n');

            // Approve unlimited amount (max uint256)
            const maxAllowance = ethers.constants.MaxUint256;

            // Get current gas price and add 50% buffer
            const feeData = await provider.getFeeData();
            const gasPrice = feeData.gasPrice
                ? feeData.gasPrice.mul(150).div(100)
                : ethers.utils.parseUnits('50', 'gwei');

            console.log(`⛽ Gas Price: ${ethers.utils.formatUnits(gasPrice, 'gwei')} Gwei`);

            const approveMainTx = await polymarketContract.approve(
                POLYMARKET_EXCHANGE,
                maxAllowance,
                {
                    gasPrice: gasPrice,
                    gasLimit: 100000,
                }
            );

            const approveNegRiskTx = await polymarketContract.approve(
                NEG_RISK_EXCHANGE,
                maxAllowance,
                {
                    gasPrice: gasPrice,
                    gasLimit: 100000,
                }
            );

            const approveNegRiskAdapterTx = await polymarketContract.approve(
                NEG_RISK_ADAPTER,
                maxAllowance,
                {
                    gasPrice: gasPrice,
                    gasLimit: 100000,
                }
            );

            console.log(`⏳ Main Transaction sent: ${approveMainTx.hash}`);
            console.log('⏳ Waiting for confirmation...\n');

            const mainReceipt = await approveMainTx.wait();

            console.log(`⏳ NegRisk Transaction sent: ${approveNegRiskTx.hash}`);
            console.log('⏳ Waiting for confirmation...\n');

            const negRiskReceipt = await approveNegRiskTx.wait();

            console.log(`⏳ NegRisk Adapter Transaction sent: ${approveNegRiskAdapterTx.hash}`);
            console.log('⏳ Waiting for confirmation...\n');

            const negRiskAdapterReceipt = await approveNegRiskAdapterTx.wait();

            if (mainReceipt.status === 1) {
                console.log('✅ Allowance set successfully!');
                console.log(`🔗 Transaction: https://polygonscan.com/tx/${mainReceipt.hash}\n`);

                // Verify new allowance
                const newAllowance = await polymarketContract.allowance(
                    PROXY_WALLET,
                    POLYMARKET_EXCHANGE
                );
                const newAllowanceFormatted = ethers.utils.formatUnits(
                    newAllowance,
                    polymarketDecimals
                );
                console.log(`✅ New Allowance: ${newAllowanceFormatted} USDC`);
            } else {
                console.log('❌ Transaction failed!');
            }

            if (negRiskReceipt.status === 1) {
                console.log('✅ Allowance set successfully!');
                console.log(`🔗 Transaction: https://polygonscan.com/tx/${negRiskReceipt.hash}\n`);

                // Verify new allowance
                const newAllowance = await polymarketContract.allowance(
                    PROXY_WALLET,
                    NEG_RISK_EXCHANGE
                );
                const newAllowanceFormatted = ethers.utils.formatUnits(
                    newAllowance,
                    polymarketDecimals
                );
                console.log(`✅ New Allowance: ${newAllowanceFormatted} USDC`);
            } else {
                console.log('❌ Transaction failed!');
            }

            if (negRiskAdapterReceipt.status === 1) {
                console.log('✅ Allowance set successfully!');
                console.log(
                    `🔗 Transaction: https://polygonscan.com/tx/${negRiskAdapterReceipt.hash}\n`
                );

                // Verify new allowance
                const newAllowance = await polymarketContract.allowance(
                    PROXY_WALLET,
                    NEG_RISK_ADAPTER
                );
                const newAllowanceFormatted = ethers.utils.formatUnits(
                    newAllowance,
                    polymarketDecimals
                );
                console.log(`✅ New Allowance: ${newAllowanceFormatted} USDC`);
            } else {
                console.log('❌ Transaction failed!');
            }
        } else {
            console.log('✅ Allowance is already sufficient! No action needed.');
        }

        await syncPolymarketAllowanceCache(polymarketDecimals, provider);
    } catch (error: any) {
        console.error('❌ Error:', error.message);
        if (error.code === 'INSUFFICIENT_FUNDS') {
            console.log('\n⚠️  You need MATIC for gas fees on Polygon!');
        }
    }
}

async function setAllowanceForCTFContract(
    contract: ethers.Contract,
    provider: ethers.providers.JsonRpcProvider,
    wallet: ethers.Wallet
) {
    try {
        console.log('📝 Setting unlimited allowance for CTF Polymarket...\n');

        // Get current gas price and add 50% buffer
        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice
            ? feeData.gasPrice.mul(150).div(100)
            : ethers.utils.parseUnits('50', 'gwei');

        console.log(`⛽ Gas Price: ${ethers.utils.formatUnits(gasPrice, 'gwei')} Gwei`);

        const approveCTFTx = await contract.setApprovalForAll(POLYMARKET_EXCHANGE, true, {
            gasPrice: gasPrice,
            gasLimit: 100000,
        });

        const approveCTFNegRiskTx = await contract.setApprovalForAll(NEG_RISK_EXCHANGE, true, {
            gasPrice: gasPrice,
            gasLimit: 100000,
        });

        const approveCTFNegRiskAdapterTx = await contract.setApprovalForAll(
            NEG_RISK_ADAPTER,
            true,
            {
                gasPrice: gasPrice,
                gasLimit: 100000,
            }
        );

        console.log(`⏳ Main Transaction sent: ${approveCTFTx.hash}`);
        console.log('⏳ Waiting for confirmation...\n');

        const mainReceipt = await approveCTFTx.wait();

        console.log(`⏳ NegRisk Transaction sent: ${approveCTFNegRiskTx.hash}`);
        console.log('⏳ Waiting for confirmation...\n');

        const negRiskReceipt = await approveCTFNegRiskTx.wait();

        console.log(`⏳ NegRisk Adapter Transaction sent: ${approveCTFNegRiskAdapterTx.hash}`);
        console.log('⏳ Waiting for confirmation...\n');

        const negRiskAdapterReceipt = await approveCTFNegRiskAdapterTx.wait();

        if (mainReceipt.status === 1) {
            console.log('✅ Allowance set successfully!');
            console.log(`🔗 Transaction: https://polygonscan.com/tx/${mainReceipt.hash}\n`);
        } else {
            console.log('❌ Transaction failed!');
        }

        if (negRiskReceipt.status === 1) {
            console.log('✅ Allowance set successfully!');
            console.log(`🔗 Transaction: https://polygonscan.com/tx/${negRiskReceipt.hash}\n`);
        } else {
            console.log('❌ Transaction failed!');
        }

        if (negRiskAdapterReceipt.status === 1) {
            console.log('✅ Allowance set successfully!');
            console.log(
                `🔗 Transaction: https://polygonscan.com/tx/${negRiskAdapterReceipt.hash}\n`
            );
        } else {
            console.log('❌ Transaction failed!');
        }
    } catch (error: any) {
        console.error('❌ Error:', error.message);
        if (error.code === 'INSUFFICIENT_FUNDS') {
            console.log('\n⚠️  You need MATIC for gas fees on Polygon!');
        }
    }
}

checkAndSetAllowance()
    .then(() => {
        console.log('\n✅ Done!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    });

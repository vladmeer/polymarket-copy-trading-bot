import * as fs from 'fs';
import * as path from 'path';
import fetchData from './fetchData';

const PAPER_TRADES_FILE = path.join(process.cwd(), 'paper_trades.json');

export interface PaperTrade {
    timestamp: number;
    side: 'BUY' | 'SELL';
    market: string;
    outcome: string;
    usdcAmount: number;
    tokenAmount: number;
    price: number;
    traderAddress: string;
    conditionId: string;
    asset: string;
}

export interface PaperPosition {
    market: string;
    outcome: string;
    conditionId: string;
    asset: string;
    tokenAmount: number;
    avgEntryPrice: number;
    totalInvested: number;
}

export interface PaperTradingData {
    startTime: number;
    trades: PaperTrade[];
    positions: Record<string, PaperPosition>;
    realizedPnL: number;
    totalInvested: number;
}

const loadPaperTradingData = (): PaperTradingData => {
    try {
        if (fs.existsSync(PAPER_TRADES_FILE)) {
            const data = fs.readFileSync(PAPER_TRADES_FILE, 'utf-8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Error loading paper trading data:', error);
    }
    return {
        startTime: Date.now(),
        trades: [],
        positions: {},
        realizedPnL: 0,
        totalInvested: 0,
    };
};

const savePaperTradingData = (data: PaperTradingData): void => {
    try {
        fs.writeFileSync(PAPER_TRADES_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error saving paper trading data:', error);
    }
};

export const recordPaperTrade = async (trade: PaperTrade): Promise<void> => {
    const data = loadPaperTradingData();

    // Add trade to history
    data.trades.push(trade);

    const positionKey = `${trade.conditionId}:${trade.asset}`;

    if (trade.side === 'BUY') {
        // Update or create position
        const existing = data.positions[positionKey];
        if (existing) {
            // Average in new tokens
            const totalTokens = existing.tokenAmount + trade.tokenAmount;
            const totalCost = existing.totalInvested + trade.usdcAmount;
            existing.tokenAmount = totalTokens;
            existing.totalInvested = totalCost;
            existing.avgEntryPrice = totalCost / totalTokens;
        } else {
            data.positions[positionKey] = {
                market: trade.market,
                outcome: trade.outcome,
                conditionId: trade.conditionId,
                asset: trade.asset,
                tokenAmount: trade.tokenAmount,
                avgEntryPrice: trade.price,
                totalInvested: trade.usdcAmount,
            };
        }
        data.totalInvested += trade.usdcAmount;
    } else {
        // SELL - reduce position and calculate realized P&L
        const existing = data.positions[positionKey];
        if (existing) {
            const sellValue = trade.usdcAmount;
            const costBasis = existing.avgEntryPrice * trade.tokenAmount;
            const realizedPnL = sellValue - costBasis;

            data.realizedPnL += realizedPnL;
            existing.tokenAmount -= trade.tokenAmount;
            existing.totalInvested -= costBasis;

            // Remove position if fully closed
            if (existing.tokenAmount <= 0.01) {
                delete data.positions[positionKey];
            }
        }
    }

    savePaperTradingData(data);
};

export interface PaperTradingStats {
    totalTrades: number;
    buyTrades: number;
    sellTrades: number;
    totalInvested: number;
    currentValue: number;
    realizedPnL: number;
    unrealizedPnL: number;
    totalPnL: number;
    roi: number;
    openPositions: number;
    runningTime: string;
}

export const getPaperTradingStats = async (): Promise<PaperTradingStats> => {
    const data = loadPaperTradingData();

    // Calculate current value of open positions
    let currentValue = 0;
    let unrealizedPnL = 0;

    for (const position of Object.values(data.positions)) {
        // Try to get current market price
        try {
            const orderBook = await fetchData(
                `https://clob.polymarket.com/book?token_id=${position.asset}`
            );
            const bestBid = orderBook?.bids?.[0];
            const currentPrice = bestBid ? parseFloat(bestBid.price) : position.avgEntryPrice;
            const positionValue = position.tokenAmount * currentPrice;
            currentValue += positionValue;
            unrealizedPnL += positionValue - position.totalInvested;
        } catch {
            // Fall back to entry price if API fails
            currentValue += position.totalInvested;
        }
    }

    const totalPnL = data.realizedPnL + unrealizedPnL;
    const roi = data.totalInvested > 0 ? (totalPnL / data.totalInvested) * 100 : 0;

    // Calculate running time
    const runningMs = Date.now() - data.startTime;
    const hours = Math.floor(runningMs / (1000 * 60 * 60));
    const minutes = Math.floor((runningMs % (1000 * 60 * 60)) / (1000 * 60));
    const runningTime = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

    return {
        totalTrades: data.trades.length,
        buyTrades: data.trades.filter(t => t.side === 'BUY').length,
        sellTrades: data.trades.filter(t => t.side === 'SELL').length,
        totalInvested: data.totalInvested,
        currentValue,
        realizedPnL: data.realizedPnL,
        unrealizedPnL,
        totalPnL,
        roi,
        openPositions: Object.keys(data.positions).length,
        runningTime,
    };
};

export const resetPaperTrading = (): void => {
    const freshData: PaperTradingData = {
        startTime: Date.now(),
        trades: [],
        positions: {},
        realizedPnL: 0,
        totalInvested: 0,
    };
    savePaperTradingData(freshData);
};

export const getPaperTradingReport = async (): Promise<string> => {
    const stats = await getPaperTradingStats();
    const data = loadPaperTradingData();

    let report = `
╔══════════════════════════════════════════════════════════════╗
║                    PAPER TRADING REPORT                       ║
╠══════════════════════════════════════════════════════════════╣
║  Running Time: ${stats.runningTime.padEnd(45)}║
║  Total Trades: ${stats.totalTrades.toString().padEnd(45)}║
║    - Buys:     ${stats.buyTrades.toString().padEnd(45)}║
║    - Sells:    ${stats.sellTrades.toString().padEnd(45)}║
╠══════════════════════════════════════════════════════════════╣
║  Total Invested:    $${stats.totalInvested.toFixed(2).padEnd(39)}║
║  Current Value:     $${stats.currentValue.toFixed(2).padEnd(39)}║
║  Realized P&L:      $${stats.realizedPnL.toFixed(2).padEnd(39)}║
║  Unrealized P&L:    $${stats.unrealizedPnL.toFixed(2).padEnd(39)}║
║  Total P&L:         $${stats.totalPnL.toFixed(2).padEnd(39)}║
║  ROI:               ${stats.roi.toFixed(2)}%${' '.repeat(37)}║
╠══════════════════════════════════════════════════════════════╣
║  Open Positions: ${stats.openPositions.toString().padEnd(43)}║
╚══════════════════════════════════════════════════════════════╝
`;

    if (Object.keys(data.positions).length > 0) {
        report += '\n\nOpen Positions:\n';
        for (const position of Object.values(data.positions)) {
            report += `  • ${position.market} (${position.outcome})\n`;
            report += `    Tokens: ${position.tokenAmount.toFixed(2)} @ $${position.avgEntryPrice.toFixed(4)} avg\n`;
            report += `    Invested: $${position.totalInvested.toFixed(2)}\n\n`;
        }
    }

    return report;
};

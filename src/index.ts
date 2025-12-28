import connectDB, { closeDB } from './config/db';
import { ENV } from './config/env';
import createClobClient from './utils/createClobClient';
import tradeExecutor, { stopTradeExecutor } from './services/tradeExecutor';
import tradeMonitor, { stopTradeMonitor } from './services/tradeMonitor';
import Logger from './utils/logger';
import { performHealthCheck, logHealthCheck } from './utils/healthCheck';
import { resetPaperTrading, getPaperTradingReport } from './utils/paperTrading';
import test from './test/test';

const USER_ADDRESSES = ENV.USER_ADDRESSES;
const PROXY_WALLET = ENV.PROXY_WALLET;
const DRY_RUN = ENV.DRY_RUN;

// Graceful shutdown handler
let isShuttingDown = false;

const gracefulShutdown = async (signal: string) => {
    if (isShuttingDown) {
        Logger.warning('Shutdown already in progress, forcing exit...');
        process.exit(1);
    }

    isShuttingDown = true;
    Logger.separator();
    Logger.info(`Received ${signal}, initiating graceful shutdown...`);

    try {
        // Stop services
        stopTradeMonitor();
        stopTradeExecutor();

        // Give services time to finish current operations
        Logger.info('Waiting for services to finish current operations...');
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Print paper trading report if in dry run mode
        if (DRY_RUN) {
            const report = await getPaperTradingReport();
            console.log(report);
        }

        // Close database connection
        await closeDB();

        Logger.success('Graceful shutdown completed');
        process.exit(0);
    } catch (error) {
        Logger.error(`Error during shutdown: ${error}`);
        process.exit(1);
    }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
    Logger.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
    // Don't exit immediately, let the application try to recover
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
    Logger.error(`Uncaught Exception: ${error.message}`);
    // Exit immediately for uncaught exceptions as the application is in an undefined state
    gracefulShutdown('uncaughtException').catch(() => {
        process.exit(1);
    });
});

// Handle termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export const main = async () => {
    try {
        // Welcome message for first-time users
        const colors = {
            reset: '\x1b[0m',
            yellow: '\x1b[33m',
            cyan: '\x1b[36m',
        };
        
        console.log(`\n${colors.yellow}💡 First time running the bot?${colors.reset}`);
        console.log(`   Read the guide: ${colors.cyan}GETTING_STARTED.md${colors.reset}`);
        console.log(`   Run health check: ${colors.cyan}npm run health-check${colors.reset}\n`);
        
        await connectDB();
        Logger.startup(USER_ADDRESSES, PROXY_WALLET);

        // Paper trading mode banner
        if (DRY_RUN) {
            console.log(`\n${colors.yellow}╔══════════════════════════════════════════════════════════════╗${colors.reset}`);
            console.log(`${colors.yellow}║             📋 PAPER TRADING MODE ENABLED 📋                  ║${colors.reset}`);
            console.log(`${colors.yellow}╠══════════════════════════════════════════════════════════════╣${colors.reset}`);
            console.log(`${colors.yellow}║  No real orders will be executed.                            ║${colors.reset}`);
            console.log(`${colors.yellow}║  All trades are tracked hypothetically for testing.          ║${colors.reset}`);
            console.log(`${colors.yellow}║  Results saved to: paper_trades.json                         ║${colors.reset}`);
            console.log(`${colors.yellow}║                                                              ║${colors.reset}`);
            console.log(`${colors.yellow}║  To switch to LIVE trading, set DRY_RUN='false' in .env      ║${colors.reset}`);
            console.log(`${colors.yellow}╚══════════════════════════════════════════════════════════════╝${colors.reset}\n`);

            // Reset paper trading data for fresh start
            resetPaperTrading();
            Logger.info('Paper trading data reset for fresh session');
        }

        // Perform initial health check
        Logger.info('Performing initial health check...');
        const healthResult = await performHealthCheck();
        logHealthCheck(healthResult);

        if (!healthResult.healthy) {
            Logger.warning('Health check failed, but continuing startup...');
        }

        Logger.info('Initializing CLOB client...');
        const clobClient = await createClobClient();
        Logger.success('CLOB client ready');

        Logger.separator();
        Logger.info('Starting trade monitor...');
        tradeMonitor();

        Logger.info('Starting trade executor...');
        tradeExecutor(clobClient);

        // test(clobClient);
    } catch (error) {
        Logger.error(`Fatal error during startup: ${error}`);
        await gracefulShutdown('startup-error');
    }
};

main();

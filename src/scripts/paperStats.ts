import { getPaperTradingReport } from '../utils/paperTrading';

const main = async () => {
    const report = await getPaperTradingReport();
    console.log(report);
    process.exit(0);
};

main();

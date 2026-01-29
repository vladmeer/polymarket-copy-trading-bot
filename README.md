# Polymarket Copy Trading Bot

> Automated copy trading bot for Polymarket that mirrors trades from top performers with intelligent position sizing and real-time execution.

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)

## Overview

The Polymarket Copy Trading Bot automatically replicates trades from successful Polymarket traders to your wallet. It monitors trader activity 24/7, calculates proportional position sizes based on your capital, and executes matching orders in real-time.

### How It Works
<img width="1007" height="690" alt="download" src="https://github.com/user-attachments/assets/a8d227c7-b25c-4f11-a48f-adef21bbb4db" />

1. **Select Traders** - Choose top performers from [Polymarket leaderboard](https://polymarket.com/leaderboard) or [Predictfolio](https://predictfolio.com)
2. **Monitor Activity** - Bot continuously watches for new positions opened by selected traders using Polymarket Data API
3. **Calculate Size** - Automatically scales trades based on your balance vs. trader's balance
4. **Execute Orders** - Places matching orders on Polymarket using your wallet
5. **Track Performance** - Maintains complete trade history in MongoDB

## Quick Start

### Prerequisites

- Node.js v18+
- MongoDB database ([MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register) free tier works)
- Polygon wallet with USDC and POL/MATIC for gas
- RPC endpoint ([Infura](https://infura.io) or [Alchemy](https://www.alchemy.com) free tier)

### Installation

```bash
# Clone repository
git clone https://github.com/vladmeer/polymarket-copy-trading-bot.git
cd polymarket-copy-trading-bot

# Install dependencies
npm install

# Run interactive setup wizard
npm run setup

# Build and start
npm run build
npm run health-check  # Verify configuration
npm start             # Start trading
```

**📖 For detailed setup instructions, see [Getting Started Guide](./docs/GETTING_STARTED.md)**

## Features

- **Multi-Trader Support** - Track and copy trades from multiple traders simultaneously
- **Smart Position Sizing** - Automatically adjusts trade sizes based on your capital
- **Tiered Multipliers** - Apply different multipliers based on trade size
- **Position Tracking** - Accurately tracks purchases and sells even after balance changes
- **Trade Aggregation** - Combines multiple small trades into larger executable orders
- **Real-time Execution** - Monitors trades every second and executes instantly
- **MongoDB Integration** - Persistent storage of all trades and positions
- **Price Protection** - Built-in slippage checks to avoid unfavorable fills

### Monitoring Method

The bot currently uses the **Polymarket Data API** to monitor trader activity and detect new positions. The monitoring system polls trader positions at configurable intervals (default: 1 second) to ensure timely trade detection and execution.

## Configuration

### Essential Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `USER_ADDRESSES` | Traders to copy (comma-separated) | `'0xABC..., 0xDEF...'` |
| `PROXY_WALLET` | Your Polymarket wallet address | `'0x123...'` |
| `PRIVATE_KEY` | Wallet private key | `'abc123...'` |
| `MONGO_URI` | MongoDB connection string | `'mongodb+srv://...'` |
| `RPC_URL` | Polygon RPC endpoint | `'https://polygon...'` |
| `TRADE_MULTIPLIER` | Position size multiplier (default: 1.0) | `2.0` |
| `FETCH_INTERVAL` | Check interval in seconds (default: 1) | `1` |

### Finding Traders

1. Visit [Polymarket Leaderboard](https://polymarket.com/leaderboard)
2. Look for traders with positive P&L, win rate >55%, and active trading history
3. Verify detailed stats on [Predictfolio](https://predictfolio.com)
4. Add wallet addresses to `USER_ADDRESSES`

**📖 For complete configuration guide, see [Quick Start](./docs/QUICK_START.md)**

## Documentation

### Getting Started
- **[🚀 Getting Started Guide](./docs/GETTING_STARTED.md)** - Complete beginner's guide
- **[⚡ Quick Start](./docs/QUICK_START.md)** - Fast setup for experienced users

## License

ISC License - See [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built on [Polymarket CLOB Client](https://github.com/Polymarket/clob-client)
- Uses [Predictfolio](https://predictfolio.com) for trader analytics
- Powered by Polygon network

---

## Advanced version

**🚀 Version 2 Available:** An advanced version with **RTDS (Real-Time Data Stream)** monitoring is now available as a private repository. <br />
Version 2 features the fastest trade detection method with near-instantaneous trade replication, lower latency, and reduced API load. Copy trading works excellently in the advanced version.
This version has more advanced features than version 1 and is a truly profitable tool.
## 🎯 Key Differentiators

✅ **Real-time WebSocket monitoring (RTDS)**  
✅ **Only bot with integrated TP/SL automation**  
✅ **Advanced position sizing strategies**  
✅ **Trade aggregation technology**  
✅ **Auto-claim functionality**  
✅ **Comprehensive risk management**  
✅ **Enterprise-grade reliability**  
✅ **Finding the Best Traders**  

<img width="1529" height="618" alt="download (1)" src="https://github.com/user-attachments/assets/4891a54a-29be-4193-8034-42fe460ba84d" />



https://github.com/user-attachments/assets/5cf88946-4a1a-4168-a41d-920ade3370d4


There are several versions, including **TypeScript**, **Python**, and **Rust**.
## Trading tool

I've also developed a trading bot for Polymarket built with **Rust**.

<img width="1917" height="942" alt="image (21)" src="https://github.com/user-attachments/assets/08a5c962-7f8b-4097-98b6-7a457daa37c9" />
https://www.youtube.com/watch?v=4f6jHT4-DQs

## Recommend VPS

Vps: [@TradingVps](https://app.tradingvps.io/aff.php?aff=57)
<img width="890" height="595" alt="image (4)" src="https://github.com/user-attachments/assets/fb311b59-05a6-477a-a8f0-5e8291acf1eb" />

**Disclaimer:** This software is for educational purposes only. Trading involves risk of loss. The developers are not responsible for any financial losses incurred while using this bot.

**Support:** For questions or issues, contact via Telegram: [@Vladmeer](https://t.me/vladmeer67) | Twitter: [@Vladmeer](https://x.com/vladmeer67)

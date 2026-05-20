# MEXC Terminal — Bloomberg-Style Trading Dashboard

A full-stack trading dashboard inspired by the Bloomberg Terminal aesthetic, built with:

- **BFF** — Node.js / Express + WebSocket proxy for MEXC exchange data
- **Frontend** — React + Vite + lightweight-charts (TradingView)

## Architecture

```log
Browser ←─WS/REST─→ BFF (Node.js :3001) ←─WS/REST─→ MEXC Exchange
```

The BFF maintains a single persistent WebSocket to MEXC and fans out real-time data to all connected browser clients. REST endpoints provide initial data snapshots.

## Quick Start

### 1. Install dependencies

```bash
cd bff && npm install
cd ../frontend && npm install
```

### 2. Configure the BFF (optional — public data works without keys)

```bash
cp bff/.env.example bff/.env
# Edit bff/.env with your MEXC API keys if needed
```

### 3. Start both services

**Terminal 1 — BFF:**

```bash
cd bff && npm run dev
```

**Terminal 2 — Frontend:**

```bash
cd frontend && npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

## Features

| Feature | Detail |
| --- | --- |
| Real-time order book | Level-2 depth with visual bars, bid/ask spread |
| Candlestick chart | OHLCV with volume histogram, 7 intervals |
| Live trade feed | Colour-coded buy/sell stream |
| Ticker tape | Scrolling 24h price changes across top |
| Watchlist | Live prices + 24h change + volume bars |
| Trading panel | Demo order form (Market / Limit / Stop) |
| Bloomberg theme | Black bg, amber text, green/red market colors |

## MEXC WebSocket Channels

| Stream | Channel |
| --- | --- |
| Trades | `spot@public.deals.v3.api@{SYMBOL}` |
| Order book | `spot@public.depth.v3.api@{SYMBOL}@20` |
| Klines | `spot@public.kline.v3.api@{SYMBOL}@Min1` |
| Mini-tickers | `spot@public.miniTickers.v3.api@UTC` |

## Notes

- **Demo mode** — the trading panel does not submit real orders
- No MEXC API keys required for read-only market data
- The BFF reconnects automatically if MEXC drops the connection

import 'dotenv/config';

export const config = {
  port: process.env.PORT || 3001,
  mexcRestBase: 'https://api.mexc.com',
  mexcWsUrl: 'wss://wbs.mexc.com/ws',
  defaultSymbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'BNBUSDT'],
  apiKey: process.env.MEXC_API_KEY || '',
  apiSecret: process.env.MEXC_API_SECRET || '',
};

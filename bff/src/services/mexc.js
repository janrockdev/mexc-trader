import axios from 'axios';
import { config } from '../config.js';

export class MexcService {
  constructor() {
    this.client = axios.create({
      baseURL: config.mexcRestBase,
      timeout: 10_000,
    });
  }

  /** Single symbol 24hr ticker */
  async getTicker(symbol) {
    const { data } = await this.client.get('/api/v3/ticker/24hr', { params: { symbol } });
    return data;
  }

  /** All symbols 24hr tickers */
  async getAllTickers() {
    const { data } = await this.client.get('/api/v3/ticker/24hr');
    return data;
  }

  /** Level-2 order book snapshot */
  async getOrderBook(symbol, limit = 20) {
    const { data } = await this.client.get('/api/v3/depth', { params: { symbol, limit: Number(limit) } });
    return data;
  }

  /** Most recent trades */
  async getRecentTrades(symbol, limit = 50) {
    const { data } = await this.client.get('/api/v3/trades', { params: { symbol, limit: Number(limit) } });
    return data;
  }

  /**
   * Candlestick / kline data
   * interval: 1m | 5m | 15m | 30m | 60m | 4h | 1d | 1W | 1M
   */
  async getKlines(symbol, interval = '1m', limit = 200) {
    const { data } = await this.client.get('/api/v3/klines', {
      params: { symbol, interval, limit: Number(limit) },
    });
    // MEXC kline format: [openTime, open, high, low, close, volume, closeTime, quoteVol, trades, ...]
    return data.map((k) => ({
      time: Math.floor(k[0] / 1000),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }));
  }

  /** Exchange info for a symbol (lot size, tick size, etc.) */
  async getSymbolInfo(symbol) {
    const { data } = await this.client.get('/api/v3/exchangeInfo', { params: { symbol } });
    return data;
  }
}

import axios from 'axios';
import { createHmac } from 'node:crypto';
import { config } from '../config.js';

export class MexcService {
  constructor() {
    this.client = axios.create({
      baseURL: config.mexcRestBase,
      timeout: 10_000,
    });
  }

  /** Build a signed query string and GET the endpoint. Requires API key + secret. */
  async _signedGet(path, params = {}) {
    const payload = new URLSearchParams({ ...params, timestamp: Date.now() }).toString();
    const signature = createHmac('sha256', config.apiSecret).update(payload).digest('hex');
    const { data } = await this.client.get(`${path}?${payload}&signature=${signature}`, {
      headers: { 'X-MEXC-APIKEY': config.apiKey },
    });
    return data;
  }

  /** Build and execute a signed Futures GET request (OPEN-API auth). */
  async _signedFuturesGet(path, params = {}) {
    const reqTime = String(Date.now());
    const entries = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .sort(([a], [b]) => a.localeCompare(b));
    const paramString = entries
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join('&');

    // Futures signature: accessKey + timestamp + parameterString
    const target = `${config.apiKey}${reqTime}${paramString}`;
    const signature = createHmac('sha256', config.apiSecret).update(target).digest('hex');
    const query = paramString ? `?${paramString}` : '';

    const { data } = await this.client.get(`${path}${query}`, {
      headers: {
        ApiKey: config.apiKey,
        'Request-Time': reqTime,
        Signature: signature,
        'Recv-Window': '5000',
      },
    });
    return data;
  }

  /** Build and execute a signed Futures POST request (OPEN-API auth). */
  async _signedFuturesPost(path, body = {}) {
    const reqTime = String(Date.now());
    const filtered = Object.fromEntries(
      Object.entries(body).filter(([, v]) => v !== undefined && v !== null)
    );
    const payload = JSON.stringify(filtered);

    // Futures POST signature: accessKey + timestamp + jsonString
    const target = `${config.apiKey}${reqTime}${payload}`;
    const signature = createHmac('sha256', config.apiSecret).update(target).digest('hex');

    const { data } = await this.client.post(path, filtered, {
      headers: {
        ApiKey: config.apiKey,
        'Request-Time': reqTime,
        Signature: signature,
        'Recv-Window': '5000',
        'Content-Type': 'application/json',
      },
    });
    return data;
  }

  /** Place a futures order via MEXC contract API. */
  async placeFuturesOrder({ symbol, price, vol, leverage = 5, side, type = 5, openType = 2 }) {
    return this._signedFuturesPost('/api/v1/private/order/create', {
      symbol,
      price,
      vol,
      leverage,
      side,
      type,
      openType,
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

  /** Account balances — only non-zero assets. Requires API key. */
  async getAccountBalances() {
    const data = await this._signedGet('/api/v3/account');
    return (data.balances ?? []).filter((b) => +b.free > 0 || +b.locked > 0);
  }

  /** Open spot orders. Pass symbol to filter, or omit for all. Requires API key. */
  async getOpenOrders(symbol) {
    const params = symbol ? { symbol } : {};
    return this._signedGet('/api/v3/openOrders', params);
  }

  /** Futures wallet/account assets. Requires futures-enabled API key. */
  async getFuturesAccountAssets() {
    return this._signedFuturesGet('/api/v1/private/account/assets');
  }

  /** Futures open positions. Tries known endpoint variants. */
  async getFuturesOpenPositions() {
    const candidates = [
      '/api/v1/private/position/open_positions',
      '/api/v1/private/position/list/open_positions',
    ];

    let lastErr = null;
    for (const path of candidates) {
      try {
        return await this._signedFuturesGet(path);
      } catch (err) {
        lastErr = err;
        if (err?.response?.status === 404) continue;
        throw err;
      }
    }

    throw lastErr ?? new Error('No valid futures positions endpoint found');
  }
}

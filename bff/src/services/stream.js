import WebSocket from 'ws';
import { config } from '../config.js';
import { MexcService } from './mexc.js';

const PING_INTERVAL_MS      = 15_000;
const RECONNECT_DELAY_MS    = 3_000;
const POLL_SYMBOL_MS        = 2_000;   // orderbook + trades polling interval
const POLL_KLINE_MS         = 5_000;   // kline polling interval
const POLL_TICKER_MS        = 3_000;   // all-tickers polling interval

/**
 * Manages a single persistent MEXC WebSocket connection.
 * Multiplexes messages to registered frontend client sockets.
 *
 * If the WS subscription is geo-blocked, automatically falls back to
 * REST polling and pushes updates in the same message format.
 *
 * Channel naming (MEXC spot v3):
 *   Trades  : spot@public.deals.v3.api@{SYMBOL}
 *   Depth   : spot@public.depth.v3.api@{SYMBOL}@{LEVELS}
 *   Klines  : spot@public.kline.v3.api@{SYMBOL}@{INTERVAL}
 *   Tickers : spot@public.miniTickers.v3.api@UTC
 */
export class MexcStream {
  /** @type {Map<string, Set<import('ws').WebSocket>>} symbol → client sockets */
  #subscribers = new Map();
  /** @type {Set<import('ws').WebSocket>} clients subscribed to mini-tickers */
  #tickerClients = new Set();
  /** @type {import('ws').WebSocket | null} */
  #ws = null;
  #pingTimer = null;

  // REST polling fallback
  #wsBlocked = false;
  #mexc = new MexcService();
  /** @type {Map<string, ReturnType<typeof setInterval>>} */
  #pollTimers = new Map();
  #tickerPollTimer = null;
  /** @type {Map<string, number>} symbol → orderbook depth limit */
  #symbolDepth = new Map();

  constructor() {
    this.#connect();
  }

  // ── Private ──────────────────────────────────────────────────────────────

  #connect() {
    this.#ws = new WebSocket(config.mexcWsUrl);

    this.#ws.on('open', () => {
      console.log('[stream] Connected to MEXC WebSocket');
      this.#startPing();
      this.#resubscribeAll();
    });

    this.#ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        this.#route(msg);
      } catch { /* ignore malformed frames */ }
    });

    this.#ws.on('close', () => {
      console.log('[stream] MEXC WebSocket closed — reconnecting');
      clearInterval(this.#pingTimer);
      setTimeout(() => this.#connect(), RECONNECT_DELAY_MS);
    });

    this.#ws.on('error', (err) => {
      console.error('[stream] MEXC WebSocket error:', err.message);
    });
  }

  #startPing() {
    this.#pingTimer = setInterval(() => {
      if (this.#ws?.readyState === WebSocket.OPEN) {
        this.#ws.send(JSON.stringify({ method: 'PING' }));
      }
    }, PING_INTERVAL_MS);
  }

  #resubscribeAll() {
    const symbols = [...this.#subscribers.keys()];
    if (symbols.length) this.#sendSubscription(symbols);
    if (this.#tickerClients.size) this.#sendTickerSubscription();
  }

  #sendSubscription(symbols) {
    if (this.#ws?.readyState !== WebSocket.OPEN) return;
    const params = symbols.flatMap((s) => [
      `spot@public.deals.v3.api@${s}`,
      `spot@public.depth.v3.api@${s}@20`,
      `spot@public.kline.v3.api@${s}@Min1`,
    ]);
    this.#ws.send(JSON.stringify({ method: 'SUBSCRIPTION', params }));
  }

  #sendTickerSubscription() {
    if (this.#ws?.readyState !== WebSocket.OPEN) return;
    this.#ws.send(JSON.stringify({
      method: 'SUBSCRIPTION',
      params: ['spot@public.miniTickers.v3.api@UTC'],
    }));
  }

  /**
   * Route an inbound MEXC message to the right frontend clients.
   * Also detects geo-blocked subscriptions and activates REST polling fallback.
   */
  #route(msg) {
    // Detect subscription blocked response → switch to REST polling
    if (msg.code === 0 && typeof msg.msg === 'string' && msg.msg.includes('Blocked')) {
      if (!this.#wsBlocked) {
        console.log('[stream] WS subscriptions geo-blocked — switching to REST polling fallback');
        this.#wsBlocked = true;
        this.#startPollingForAll();
      }
      return;
    }

    const channel = msg.c ?? '';

    // Mini-ticker broadcast → all ticker subscribers
    if (channel.includes('miniTickers')) {
      const payload = JSON.stringify({ type: 'ticker', data: msg.d });
      for (const ws of this.#tickerClients) {
        if (ws.readyState === WebSocket.OPEN) ws.send(payload);
      }
      return;
    }

    // Symbol-specific channels
    // spot@public.depth.v3.api@BTCUSDT@20  → parts[2] = BTCUSDT
    // spot@public.deals.v3.api@BTCUSDT     → parts[2] = BTCUSDT
    // spot@public.kline.v3.api@BTCUSDT@Min1 → parts[2] = BTCUSDT
    let symbol = null;
    const parts = channel.split('@');
    if (parts.length >= 3) {
      symbol = parts[2]; // index 2 is always the symbol for all v3 channels
    }

    let type = 'unknown';
    if (channel.includes('deals')) type = 'trades';
    else if (channel.includes('depth')) type = 'orderbook';
    else if (channel.includes('kline')) type = 'kline';

    const payload = JSON.stringify({ type, symbol, data: msg.d, ts: msg.t });

    if (symbol && this.#subscribers.has(symbol)) {
      for (const ws of this.#subscribers.get(symbol)) {
        if (ws.readyState === WebSocket.OPEN) ws.send(payload);
      }
    }
  }

  // ── REST polling fallback ─────────────────────────────────────────────────

  #startPollingForAll() {
    for (const sym of this.#subscribers.keys()) {
      this.#startSymbolPoll(sym);
    }
    if (this.#tickerClients.size > 0) {
      this.#startTickerPoll();
    }
  }

  #startSymbolPoll(symbol) {
    if (this.#pollTimers.has(symbol)) return;

    const pollMarket = async () => {
      const clients = this.#subscribers.get(symbol);
      if (!clients || clients.size === 0) return;
      try {
        const depth = this.#symbolDepth.get(symbol) ?? 20;
        const [ob, rawTrades] = await Promise.all([
          this.#mexc.getOrderBook(symbol, depth),
          this.#mexc.getRecentTrades(symbol, 30),
        ]);

        // Orderbook — REST format matches WS expected format: { bids: [[p,q],...], asks: [...] }
        this.#pushToSymbol(symbol, 'orderbook', { bids: ob.bids, asks: ob.asks });

        // Trades — map REST → WS deals format
        const deals = rawTrades.map((t) => ({
          p: String(t.price),
          q: String(t.qty),
          S: t.isBuyerMaker ? 2 : 1,
          t: t.time,
        }));
        this.#pushToSymbol(symbol, 'trades', { deals });
      } catch (err) {
        console.error(`[stream:poll] ${symbol} market error:`, err.message);
      }
    };

    const pollKline = async () => {
      const clients = this.#subscribers.get(symbol);
      if (!clients || clients.size === 0) return;
      try {
        const klines = await this.#mexc.getKlines(symbol, '1m', 3);
        const last = klines[klines.length - 1];
        if (!last) return;
        // Wrap in WS kline format: data.k with t/o/h/l/c/v fields
        const k = { t: last.time * 1000, o: last.open, h: last.high, l: last.low, c: last.close, v: last.volume };
        this.#pushToSymbol(symbol, 'kline', { k });
      } catch (err) {
        console.error(`[stream:poll] ${symbol} kline error:`, err.message);
      }
    };

    pollMarket();
    pollKline();

    const marketTimer = setInterval(pollMarket, POLL_SYMBOL_MS);
    const klineTimer  = setInterval(pollKline,  POLL_KLINE_MS);

    // Store both timers under the symbol key as a pair
    this.#pollTimers.set(symbol, { marketTimer, klineTimer });
  }

  #stopSymbolPoll(symbol) {
    const timers = this.#pollTimers.get(symbol);
    if (timers) {
      clearInterval(timers.marketTimer);
      clearInterval(timers.klineTimer);
      this.#pollTimers.delete(symbol);
    }
  }

  #startTickerPoll() {
    if (this.#tickerPollTimer) return;

    const poll = async () => {
      if (this.#tickerClients.size === 0) return;
      try {
        const tickers = await this.#mexc.getAllTickers();
        // Map REST ticker → WS mini-ticker format used by the frontend
        const data = tickers.map((t) => ({
          s: t.symbol,
          c: t.lastPrice,
          o: t.openPrice,
          h: t.highPrice,
          l: t.lowPrice,
          v: t.volume,
          q: t.quoteVolume,
          p: t.priceChange,
          P: t.priceChangePercent,
        }));
        const payload = JSON.stringify({ type: 'ticker', data });
        for (const ws of this.#tickerClients) {
          if (ws.readyState === WebSocket.OPEN) ws.send(payload);
        }
      } catch (err) {
        console.error('[stream:poll] ticker error:', err.message);
      }
    };

    poll();
    this.#tickerPollTimer = setInterval(poll, POLL_TICKER_MS);
  }

  #pushToSymbol(symbol, type, data) {
    const payload = JSON.stringify({ type, symbol, data, ts: Date.now() });
    const clients = this.#subscribers.get(symbol);
    if (!clients) return;
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
  }

  // ── Public ───────────────────────────────────────────────────────────────

  subscribe(symbols, clientWs) {
    const newSymbols = [];
    for (const sym of symbols) {
      if (!this.#subscribers.has(sym)) {
        this.#subscribers.set(sym, new Set());
        newSymbols.push(sym);
      }
      this.#subscribers.get(sym).add(clientWs);
    }
    if (this.#wsBlocked) {
      // Already in polling mode — start polls for any new symbols
      for (const sym of newSymbols) this.#startSymbolPoll(sym);
    } else if (newSymbols.length) {
      this.#sendSubscription(newSymbols);
    }
  }

  subscribeTickers(clientWs) {
    const wasEmpty = this.#tickerClients.size === 0;
    this.#tickerClients.add(clientWs);
    if (this.#wsBlocked) {
      if (wasEmpty) this.#startTickerPoll();
    } else if (wasEmpty) {
      this.#sendTickerSubscription();
    }
  }

  /** Adjust orderbook depth for a symbol — takes effect on the next poll cycle */
  setDepth(symbol, depth) {
    this.#symbolDepth.set(symbol, Math.min(Math.max(1, depth), 2000));
  }

  unsubscribe(symbols, clientWs) {
    for (const sym of symbols) {
      this.#subscribers.get(sym)?.delete(clientWs);
      if (this.#subscribers.get(sym)?.size === 0) {
        this.#subscribers.delete(sym);
        this.#stopSymbolPoll(sym);
      }
    }
  }

  removeClient(clientWs) {
    for (const [sym, clients] of this.#subscribers) {
      clients.delete(clientWs);
      if (clients.size === 0) {
        this.#subscribers.delete(sym);
        this.#stopSymbolPoll(sym);
      }
    }
    this.#tickerClients.delete(clientWs);
  }
}

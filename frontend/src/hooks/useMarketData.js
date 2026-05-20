import { useState, useEffect, useCallback, useRef } from 'react';

const API = '/api/market';

async function apiFetch(path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = qs ? `${API}${path}?${qs}` : `${API}${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

/**
 * Core market data hook.
 * Fetches initial REST snapshots and provides updaters for WS messages.
 */
export function useMarketData(symbol) {
  const [orderBook, setOrderBook] = useState({ bids: [], asks: [] });
  const [trades, setTrades]       = useState([]);
  const [klines, setKlines]       = useState([]);
  const [ticker, setTicker]       = useState(null);
  const [tickers, setTickers]     = useState([]);
  const [loading, setLoading]     = useState(true);

  // Track max cumulative volume for depth bar scaling
  const maxBidVol = useRef(0);
  const maxAskVol = useRef(0);

  /** Called by App when a WS message arrives for the active symbol */
  const handleStreamMessage = useCallback((msg) => {
    // Internal: interval change triggers a REST kline reset
    if (msg.type === '_klines_reset' && msg.symbol === symbol && Array.isArray(msg.data)) {
      setKlines(msg.data);
      return;
    }

    if (msg.type === 'ticker' && Array.isArray(msg.data)) {
      setTickers(msg.data);
      const t = msg.data.find((d) => d.s === symbol);
      if (t) setTicker(t);
      return;
    }

    if (msg.symbol !== symbol) return;

    if (msg.type === 'orderbook') {
      const d = msg.data;
      if (!d) return;
      const bids = (d.bids ?? []).map(([p, v]) => ({ price: +p, vol: +v }));
      const asks = (d.asks ?? []).map(([p, v]) => ({ price: +p, vol: +v }));

      // Cumulative volume for depth bars
      let cumBid = 0;
      const bidsWithCum = bids.map((b) => { cumBid += b.vol; return { ...b, cum: cumBid }; });
      let cumAsk = 0;
      const asksWithCum = asks.map((a) => { cumAsk += a.vol; return { ...a, cum: cumAsk }; });

      maxBidVol.current = cumBid;
      maxAskVol.current = cumAsk;

      setOrderBook({ bids: bidsWithCum, asks: asksWithCum });
    }

    if (msg.type === 'trades' && msg.data?.deals) {
      setTrades((prev) => {
        const newTrades = msg.data.deals.map((d) => ({
          price: +d.p,
          qty: +d.q,
          side: d.S === 1 ? 'buy' : 'sell',
          ts: d.t,
        }));
        return [...newTrades, ...prev].slice(0, 100);
      });
    }

    if (msg.type === 'kline' && msg.data?.k) {
      const k = msg.data.k;
      const candle = {
        time: Math.floor(k.t / 1000),
        open: +k.o,
        high: +k.h,
        low: +k.l,
        close: +k.c,
        volume: +k.v,
      };
      setKlines((prev) => {
        const last = prev[prev.length - 1];
        if (last?.time === candle.time) {
          return [...prev.slice(0, -1), candle];
        }
        return [...prev, candle].slice(-500);
      });
    }
  }, [symbol]);

  // Fetch initial REST snapshots when symbol changes
  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    setLoading(true);

    Promise.all([
      apiFetch('/orderbook', { symbol, limit: 20 }),
      apiFetch('/trades',    { symbol, limit: 60 }),
      apiFetch('/klines',    { symbol, interval: '1m', limit: 200 }),
      apiFetch('/ticker',    { symbol }),
    ])
      .then(([ob, tr, kl, tk]) => {
        if (cancelled) return;

        const bids = (ob.bids ?? []).map(([p, v]) => ({ price: +p, vol: +v }));
        const asks = (ob.asks ?? []).map(([p, v]) => ({ price: +p, vol: +v }));
        let cumBid = 0;
        const bidsC = bids.map((b) => { cumBid += b.vol; return { ...b, cum: cumBid }; });
        let cumAsk = 0;
        const asksC = asks.map((a) => { cumAsk += a.vol; return { ...a, cum: cumAsk }; });
        maxBidVol.current = cumBid;
        maxAskVol.current = cumAsk;
        setOrderBook({ bids: bidsC, asks: asksC });

        setTrades((tr ?? []).map((t) => ({
          price: +t.price,
          qty: +t.qty,
          side: t.isBuyerMaker ? 'sell' : 'buy',
          ts: t.time,
        })));

        setKlines(kl ?? []);
        setTicker(tk);
        setLoading(false);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('[market] Initial fetch failed:', err);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [symbol]);

  // Fetch all tickers once on mount (for watchlist)
  useEffect(() => {
    apiFetch('/tickers')
      .then((data) => setTickers(Array.isArray(data) ? data : []))
      .catch(console.error);
  }, []);

  return {
    orderBook,
    trades,
    klines,
    ticker,
    tickers,
    loading,
    handleStreamMessage,
    maxBidVol,
    maxAskVol,
  };
}

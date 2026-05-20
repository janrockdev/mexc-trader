/**
 * Persists dashboard settings to localStorage.
 *
 * Settings schema:
 *   symbol      – active trading pair         (default: 'BTCUSDT')
 *   interval    – chart candle interval        (default: '1m')
 *   obTickSize  – order-book aggregation tick  (default: 0.01)
 *   tradeFilter – trade size filter in BTC     (default: null = all)
 *   watchlist   – ordered list of symbols shown in the watchlist panel
 *   portfolio   – array of { symbol, qty, avgPrice } positions
 */
import { useState, useCallback } from 'react';

const STORAGE_KEY = 'mexc-dashboard-settings';

const DEFAULT_WATCHLIST = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'BNBUSDT',
  'DOGEUSDT', 'AVAXUSDT', 'ADAUSDT', 'DOTUSDT', 'MATICUSDT',
];

const DEFAULTS = {
  symbol:      'BTCUSDT',
  interval:    '1m',
  obTickSize:  0.01,
  tradeFilter: null,
  watchlist:   DEFAULT_WATCHLIST,
  portfolio:   [],
};

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch { /* ignore quota / SSR errors */ }
}

/**
 * @returns {[settings: object, set: (key: string, value: any) => void]}
 */
export function useSettings() {
  const [settings, setSettings] = useState(load);

  const set = useCallback((key, value) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      save(next);
      return next;
    });
  }, []);

  return [settings, set];
}

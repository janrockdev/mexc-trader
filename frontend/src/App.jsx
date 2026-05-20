import { useState, useCallback, useEffect, useRef } from 'react';
import Header           from './components/Header.jsx';
import MarketWatchlist  from './components/MarketWatchlist.jsx';
import PriceChart       from './components/PriceChart.jsx';
import OrderBook        from './components/OrderBook.jsx';
import RecentTrades     from './components/RecentTrades.jsx';
import TradingPanel     from './components/TradingPanel.jsx';
import { useWebSocket } from './hooks/useWebSocket.js';
import { useMarketData } from './hooks/useMarketData.js';
import { useSettings }  from './hooks/useSettings.js';
import Portfolio        from './components/Portfolio.jsx';
import AccountStatus   from './components/AccountStatus.jsx';

export default function App() {
  const [settings, setSetting] = useSettings();
  const [symbol,   setSymbolRaw]   = useState(settings.symbol);
  const [interval, setIntervalRaw] = useState(settings.interval);
  const prevSymbol = useRef(null);

  const setSymbol   = useCallback((s) => { setSymbolRaw(s);   setSetting('symbol', s);   }, [setSetting]);
  const setInterval = useCallback((i) => { setIntervalRaw(i); setSetting('interval', i); }, [setSetting]);

  const {
    orderBook,
    trades,
    klines,
    ticker,
    tickers,
    loading,
    handleStreamMessage,
  } = useMarketData(symbol);

  const { send, status } = useWebSocket(handleStreamMessage);

  const btcTicker = tickers.find((t) => (t.s ?? t.symbol) === 'BTCUSDT');
  const btcPrice  = btcTicker ? +(btcTicker.c ?? btcTicker.lastPrice ?? 0) : 0;

  // Subscribe/unsubscribe when symbol changes or WS (re)connects.
  // Guard on `status === 'connected'` so the message isn't dropped
  // during the initial handshake or after a reconnect.
  useEffect(() => {
    if (status !== 'connected') return;
    if (prevSymbol.current && prevSymbol.current !== symbol) {
      send({ type: 'unsubscribe', symbols: [prevSymbol.current] });
    }
    send({ type: 'subscribe', symbols: [symbol] });
    prevSymbol.current = symbol;
  }, [symbol, send, status]);

  // Fetch new klines when interval changes (handled via REST in useMarketData — trigger refetch)
  // We pass interval down so PriceChart can show the selector;
  // actual refetch: we'll do it via a dedicated small effect
  const handleIntervalChange = useCallback((iv) => {
    setInterval(iv);
    fetch(`/api/market/klines?symbol=${symbol}&interval=${iv}&limit=200`)
      .then((r) => r.json())
      .then((data) => {
        // Dispatch directly — use a workaround: store in ref and force re-render
        // (useMarketData owns klines state; simplest is to reload window or add a prop)
        // For now we let useMarketData handle it on symbol change; interval switching
        // does a quick imperative chart update.
        handleStreamMessage({ type: '_klines_reset', symbol, data });
      })
      .catch(console.error);
  }, [symbol, handleStreamMessage]);

  const handleOpenTrade = useCallback(async (order) => {
    const px = Number(order.price);
    const activeTickerPx = +(ticker?.lastPrice ?? ticker?.c ?? ticker?.openPrice ?? ticker?.o ?? 0);
    const anyTicker = tickers.find((t) => (t.s ?? t.symbol) === order?.symbol);
    const anyTickerPx = +(anyTicker?.c ?? anyTicker?.lastPrice ?? anyTicker?.o ?? anyTicker?.openPrice ?? 0);
    const tickerPx = activeTickerPx > 0 ? activeTickerPx : anyTickerPx;
    const effectivePx = Number.isFinite(px) && px > 0 ? px : tickerPx;
    const qty = Number(order.qty);
    if (!order?.symbol || !Number.isFinite(effectivePx) || effectivePx <= 0 || !Number.isFinite(qty) || qty <= 0) return false;

    try {
      const resp = await fetch('/api/market/futures-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: order.symbol,
          side: order.side,
          orderType: order.orderType,
          qty,
          price: effectivePx,
          leverage: Number(order.leverage) || 5,
          openType: 2,
        }),
      });
      const data = await resp.json();
      if (!resp.ok || data?.error || data?.success === false) {
        console.error('[trade] futures order rejected:', data?.error || data?.message || data);
        return false;
      }
    } catch (err) {
      console.error('[trade] futures order failed:', err);
      return false;
    }

    const signedQty = order.side === 'sell' ? -qty : qty;

    setSetting('portfolio', (prevPortfolio) => {
      const list = Array.isArray(prevPortfolio) ? [...prevPortfolio] : [];
      const idx = list.findIndex((p) => p.symbol === order.symbol);

      if (idx < 0) {
        return [...list, { symbol: order.symbol, qty: signedQty, avgPrice: effectivePx }];
      }

      const cur = list[idx];
      const newQty = cur.qty + signedQty;

      // Position fully closed
      if (Math.abs(newQty) < 1e-12) {
        list.splice(idx, 1);
        return list;
      }

      // Same direction add -> weighted average update
      if ((cur.qty >= 0 && signedQty >= 0) || (cur.qty <= 0 && signedQty <= 0)) {
        const totalAbs = Math.abs(cur.qty) + Math.abs(signedQty);
        const nextAvg = totalAbs > 0
          ? ((Math.abs(cur.qty) * cur.avgPrice) + (Math.abs(signedQty) * effectivePx)) / totalAbs
          : effectivePx;
        list[idx] = { ...cur, qty: newQty, avgPrice: nextAvg };
        return list;
      }

      // Partial close keeps prior avg; flip direction resets avg to fill price
      if ((cur.qty > 0 && newQty > 0) || (cur.qty < 0 && newQty < 0)) {
        list[idx] = { ...cur, qty: newQty };
      } else {
        list[idx] = { ...cur, qty: newQty, avgPrice: effectivePx };
      }
      return list;
    });
    return true;
  }, [setSetting, ticker, tickers]);

  return (
    <div style={layout.root}>
      {/* ── Top bar ── */}
      <Header
        tickers={tickers}
        wsStatus={status}
        symbol={symbol}
        onSymbolChange={setSymbol}
      />

      {/* ── Main grid ── */}
      <div style={layout.grid}>

        {/* Left — Watchlist */}
        <div style={layout.leftCol}>
          <MarketWatchlist
            tickers={tickers}
            activeSymbol={symbol}
            onSelect={setSymbol}
            watchlist={settings.watchlist}
            onWatchlistChange={(list) => setSetting('watchlist', list)}
          />
        </div>

        {/* Center — Chart + Trading Panel */}
        <div style={layout.centerCol}>
          {/* Chart — takes most of the vertical space */}
          <div style={layout.chartArea}>
            {loading ? (
              <div style={layout.loadingOverlay}>
                <span className="text-dim" style={{ fontSize: 12, letterSpacing: '0.2em' }}>
                  LOADING {symbol}…
                </span>
              </div>
            ) : (
              <PriceChart
                symbol={symbol}
                klines={klines}
                interval={interval}
                onIntervalChange={handleIntervalChange}
              />
            )}
          </div>

          {/* Trading Panel row */}
          <div style={layout.tradingRow}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <TradingPanel symbol={symbol} ticker={ticker} onOpenTrade={handleOpenTrade} />
            </div>
            <div style={{ flex: 1.5, minWidth: 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1, height: '100%' }}>
                <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', borderTop: '1px solid #1a1a1a' }}>
                  <AccountStatus tickers={tickers} />
                </div>
                <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', borderTop: '1px solid #1a1a1a' }}>
                  <Portfolio
                    tickers={tickers}
                    portfolio={settings.portfolio}
                    onPortfolioChange={(p) => setSetting('portfolio', p)}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right — Order Book + Portfolio */}
        <div style={layout.rightCol}>
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <OrderBook
              orderBook={orderBook}
              ticker={ticker}
              onTickSizeChange={(tickSize) => {
                const depthMap = { 0.01: 20, 0.1: 50, 1: 100, 10: 500, 100: 1000 };
                send({ type: 'setDepth', symbol, depth: depthMap[tickSize] ?? 20 });
              }}
            />
          </div>
          <div style={{ height: 320, flexShrink: 0, borderTop: '1px solid #1a1a1a', minHeight: 0 }}>
            <RecentTrades trades={trades} btcPrice={btcPrice} />
          </div>
        </div>
      </div>

      {/* ── Status bar ── */}
      <div style={layout.statusBar}>
        <span className="text-dim" style={{ fontSize: 9 }}>
          MEXC TERMINAL v1.0.0 &nbsp;|&nbsp;
          DATA: MEXC EXCHANGE &nbsp;|&nbsp;
          <span className={status === 'connected' ? 'text-green' : 'text-red'}>
            {status.toUpperCase()}
          </span>
          &nbsp;|&nbsp;
          {symbol} &nbsp;|&nbsp;
          {interval.toUpperCase()} CANDLES
        </span>
        <span className="text-dim" style={{ fontSize: 9 }}>
          DEMO MODE — NO LIVE ORDERS EXECUTED
        </span>
      </div>
    </div>
  );
}

const layout = {
  root: {
    display:       'flex',
    flexDirection: 'column',
    height:        '100vh',
    width:         '100vw',
    overflow:      'hidden',
    background:    '#000',
  },
  grid: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
    gap: 1,
    padding: '1px',
    background: '#0d0d0d',
  },
  leftCol: {
    width:     192,
    flexShrink: 0,
    overflow:   'hidden',
  },
  centerCol: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
    minWidth: 0,
    overflow: 'hidden',
  },
  chartArea: {
    flex: 0.95,
    minHeight: 0,
    position: 'relative',
  },
  tradingRow: {
    height: 350,
    flexShrink: 0,
    display: 'flex',
    gap: 1,
  },
  rightCol: {
    width:     260,
    flexShrink: 0,
    overflow:   'hidden',
    display:    'flex',
    flexDirection: 'column',
  },
  loadingOverlay: {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    height:         '100%',
    background:     '#080808',
    border:         '1px solid #1c1c1c',
  },
  statusBar: {
    height:        20,
    background:    '#050505',
    borderTop:     '1px solid #111',
    display:       'flex',
    alignItems:    'center',
    justifyContent: 'space-between',
    padding:       '0 12px',
    flexShrink:    0,
  },
};

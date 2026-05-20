import { useEffect, useRef } from 'react';

/**
 * Compact Bloomberg-style clock — HH:MM:SS UTC
 */
function Clock() {
  const ref = useRef(null);
  useEffect(() => {
    const tick = () => {
      if (ref.current) {
        ref.current.textContent = new Date().toUTCString().slice(17, 25) + ' UTC';
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return <span ref={ref} className="text-dim" style={{ fontSize: 11 }} />;
}

/**
 * Scrolling ticker tape — mini-ticker data from WS
 */
function TickerTape({ tickers }) {
  // Pick a representative set for display
  const WATCH = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'BNBUSDT', 'DOGEUSDT', 'AVAXUSDT', 'ADAUSDT'];
  const items = tickers.filter((t) => WATCH.includes(t.s)).sort(
    (a, b) => WATCH.indexOf(a.s) - WATCH.indexOf(b.s),
  );
  if (!items.length) return null;

  const renderItem = (t, idx) => {
    const pct = ((+t.c - +t.o) / +t.o) * 100;
    const up = pct >= 0;
    return (
      <span key={`${t.s}-${idx}`} className="ticker-item">
        <span className="ticker-symbol">{t.s.replace('USDT', '')}</span>
        <span className="ticker-price">{(+t.c).toLocaleString('en-US', { maximumFractionDigits: 6 })}</span>
        <span className={`ticker-change ${up ? 'text-green' : 'text-red'}`}>
          {up ? '▲' : '▼'} {Math.abs(pct).toFixed(2)}%
        </span>
      </span>
    );
  };

  // Duplicate items so the ticker loops seamlessly
  return (
    <div className="ticker-tape-wrap">
      <div className="ticker-tape-inner">
        {items.map((t, i) => renderItem(t, i))}
        {items.map((t, i) => renderItem(t, i + items.length))}
      </div>
    </div>
  );
}

export default function Header({ tickers, wsStatus, symbol, onSymbolChange }) {
  const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'BNBUSDT'];

  return (
    <header style={styles.header}>
      {/* ── Logo ── */}
      <div style={styles.logo}>
        <span style={styles.logoMEXC}>MEXC</span>
        <span style={styles.logoTerminal}>TERMINAL</span>
      </div>

      {/* ── Ticker tape ── */}
      <TickerTape tickers={tickers} />

      {/* ── Right controls ── */}
      <div style={styles.right}>
        {/* Symbol selector */}
        <div style={styles.symbolRow}>
          {SYMBOLS.map((s) => (
            <button
              key={s}
              className={`btn ${symbol === s ? 'btn-active' : ''}`}
              style={styles.symBtn}
              onClick={() => onSymbolChange(s)}
            >
              {s.replace('USDT', '')}
            </button>
          ))}
        </div>

        {/* Status + clock */}
        <div style={styles.statusRow}>
          <span
            className={`status-dot ${wsStatus}`}
            title={`WebSocket: ${wsStatus}`}
          />
          <span className="text-dim" style={{ fontSize: 10, marginLeft: 4, textTransform: 'uppercase' }}>
            {wsStatus}
          </span>
          <span style={{ margin: '0 8px', color: '#1c1c1c' }}>|</span>
          <Clock />
        </div>
      </div>
    </header>
  );
}

const styles = {
  header: {
    height: 40,
    background: '#050505',
    borderBottom: '2px solid #c8a94e',
    display: 'flex',
    alignItems: 'center',
    gap: 0,
    padding: '0 12px',
    flexShrink: 0,
    overflow: 'hidden',
  },
  logo: {
    display: 'flex',
    flexDirection: 'column',
    lineHeight: 1.1,
    marginRight: 16,
    flexShrink: 0,
  },
  logoMEXC: {
    fontSize: 15,
    fontWeight: 700,
    color: '#c8a94e',
    letterSpacing: '0.2em',
  },
  logoTerminal: {
    fontSize: 8,
    fontWeight: 400,
    color: '#555',
    letterSpacing: '0.35em',
  },
  right: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 2,
    flexShrink: 0,
    marginLeft: 12,
  },
  symbolRow: {
    display: 'flex',
    gap: 2,
  },
  symBtn: {
    padding: '1px 8px',
    fontSize: 10,
    letterSpacing: '0.06em',
    minWidth: 0,
  },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
  },
};

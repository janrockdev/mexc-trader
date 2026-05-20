import { useMemo } from 'react';

const WATCH_SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'BNBUSDT',
  'DOGEUSDT', 'AVAXUSDT', 'ADAUSDT', 'DOTUSDT', 'MATICUSDT',
];

function fmt(v, d = 4) {
  const n = +v;
  if (isNaN(n)) return '—';
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return n.toFixed(d);
}

function fmtVol(v) {
  const n = +v;
  if (isNaN(n)) return '—';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toFixed(2);
}

export default function MarketWatchlist({ tickers, activeSymbol, onSelect }) {
  const rows = useMemo(() => {
    const map = new Map(tickers.map((t) => [t.symbol ?? t.s, t]));
    return WATCH_SYMBOLS.map((sym) => {
      const t = map.get(sym);
      if (!t) return { sym, price: null, pct: null, vol: null };
      const price = +(t.lastPrice ?? t.c ?? 0);
      const open  = +(t.openPrice ?? t.o ?? 0);
      const pct   = open ? ((price - open) / open) * 100 : 0;
      const vol   = +(t.quoteVolume ?? t.q ?? 0);
      return { sym, price, pct, vol };
    });
  }, [tickers]);

  return (
    <div className="panel" style={styles.container}>
      <div className="panel-header">
        <span className="panel-title">Watchlist</span>
        <span className="text-dim" style={{ fontSize: 10 }}>24H</span>
      </div>
      <div className="panel-body" style={{ padding: 0 }}>
        {rows.map(({ sym, price, pct, vol }) => {
          const up = (pct ?? 0) >= 0;
          const active = sym === activeSymbol;
          return (
            <div
              key={sym}
              style={{
                ...styles.row,
                background: active ? 'rgba(200, 169, 78, 0.08)' : undefined,
                borderLeft: active ? '2px solid #c8a94e' : '2px solid transparent',
              }}
              onClick={() => onSelect(sym)}
            >
              <div style={styles.symName}>
                <span className="text-amber font-600" style={{ fontSize: 11 }}>
                  {sym.replace('USDT', '')}
                </span>
                <span className="text-dim" style={{ fontSize: 9 }}>/USDT</span>
              </div>
              <div style={styles.priceCol}>
                <span
                  className="tabular"
                  style={{ fontSize: 11, color: price !== null ? '#e0e0e0' : '#444' }}
                >
                  {price !== null ? fmt(price) : '——'}
                </span>
                <span
                  className={`tabular ${up ? 'text-green' : 'text-red'}`}
                  style={{ fontSize: 10 }}
                >
                  {pct !== null ? `${up ? '+' : ''}${pct.toFixed(2)}%` : '——'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {/* ── Volume mini-bars at bottom ── */}
      <div style={styles.volSection}>
        <div className="panel-header" style={{ padding: '3px 8px' }}>
          <span className="panel-title" style={{ fontSize: 9 }}>Vol (USDT)</span>
        </div>
        {rows.slice(0, 5).map(({ sym, vol }) => {
          const maxVol = Math.max(...rows.map((r) => r.vol ?? 0), 1);
          const pct = ((vol ?? 0) / maxVol) * 100;
          return (
            <div key={sym} style={styles.volRow} onClick={() => onSelect(sym)}>
              <span style={{ fontSize: 10, color: '#666', width: 36, flexShrink: 0 }}>
                {sym.replace('USDT', '')}
              </span>
              <div style={styles.volBarBg}>
                <div style={{ ...styles.volBar, width: `${pct}%` }} />
              </div>
              <span style={{ fontSize: 10, color: '#888', minWidth: 40, textAlign: 'right' }}>
                {fmtVol(vol ?? 0)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles = {
  container: {
    height: '100%',
    width: '100%',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '4px 8px 4px 6px',
    cursor: 'pointer',
    borderBottom: '1px solid #0d0d0d',
    transition: 'background 0.1s',
  },
  symName: {
    display: 'flex',
    flexDirection: 'column',
  },
  priceCol: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
  },
  volSection: {
    borderTop: '1px solid #1a1a1a',
    paddingBottom: 4,
  },
  volRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '2px 8px',
    cursor: 'pointer',
  },
  volBarBg: {
    flex: 1,
    height: 4,
    background: '#111',
    borderRadius: 2,
    overflow: 'hidden',
  },
  volBar: {
    height: '100%',
    background: '#c8a94e',
    borderRadius: 2,
    transition: 'width 0.3s ease',
    opacity: 0.7,
  },
};

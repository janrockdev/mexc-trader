import { useRef, useEffect, useState } from 'react';

const FILTERS = [
  { label: 'ALL', value: null },
  { label: '0.1₿', value: 0.1 },
  { label: '1₿',   value: 1   },
  { label: '10₿',  value: 10  },
];

function fmtTime(ts) {
  return new Date(+ts).toLocaleTimeString('en-US', {
    hour:   '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function fmtPrice(p) {
  const n = +p;
  if (isNaN(n)) return '—';
  if (n >= 1000) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1)    return n.toFixed(4);
  return n.toFixed(6);
}

function fmtQty(n) {
  if (isNaN(n)) return '—';
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 1 });
  if (n >= 1)    return n.toFixed(3);
  return n.toFixed(4);
}

function fmtUsd(n) {
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + n.toFixed(0);
}

export default function RecentTrades({ trades, btcPrice }) {
  const bodyRef = useRef(null);
  const [filterBtc, setFilterBtc] = useState(null);

  // Auto-scroll to top when new trades arrive (newest first)
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [trades.length]);

  // USD notional threshold: btcThreshold × btcPrice — scales automatically to any symbol
  const minNotional = filterBtc && btcPrice > 0 ? filterBtc * btcPrice : 0;
  const visible = minNotional > 0
    ? trades.filter((t) => t.price * t.qty >= minNotional)
    : trades;

  return (
    <div className="panel" style={{ height: '100%' }}>
      <div className="panel-header" style={{ gap: 6 }}>
        <span className="panel-title">Recent Trades</span>
        <div style={{ display: 'flex', gap: 3, marginLeft: 'auto' }}>
          {FILTERS.map((f) => {
            const active = filterBtc === f.value;
            return (
              <button
                key={f.label}
                onClick={() => setFilterBtc(f.value)}
                title={f.value && btcPrice > 0 ? `≥ ${fmtUsd(f.value * btcPrice)} notional` : 'Show all trades'}
                style={{
                  background:    active ? 'rgba(200,169,78,0.15)' : 'transparent',
                  border:        `1px solid ${active ? '#c8a94e' : '#2a2a2a'}`,
                  color:         active ? '#c8a94e' : '#555',
                  fontSize:      9,
                  padding:       '1px 6px',
                  cursor:        'pointer',
                  borderRadius:  2,
                  letterSpacing: '0.05em',
                  fontFamily:    'inherit',
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
        {minNotional > 0 && (
          <span className="text-dim" style={{ fontSize: 9, whiteSpace: 'nowrap' }}>
            ≥ {fmtUsd(minNotional)}
          </span>
        )}
      </div>
      <div ref={bodyRef} className="panel-body" style={{ padding: 0 }}>
        <table className="data-table" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '33%' }} />
            <col style={{ width: '30%' }} />
            <col style={{ width: '37%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>Price</th>
              <th className="text-right">Qty</th>
              <th className="text-right">Time</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((t, i) => {
              const isBuy = t.side === 'buy';
              return (
                <tr key={i}>
                  <td
                    style={{
                      color:      isBuy ? '#00e676' : '#ff3d57',
                      fontWeight: 600,
                      fontSize:   11,
                    }}
                  >
                    {isBuy ? '▲ ' : '▼ '}
                    {fmtPrice(t.price)}
                  </td>
                  <td
                    className="text-right"
                    style={{ fontSize: 11, color: '#888' }}
                  >
                    {fmtQty(+t.qty)}
                  </td>
                  <td
                    className="text-right"
                    style={{ fontSize: 10, color: '#555' }}
                  >
                    {fmtTime(t.ts)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visible.length === 0 && (
          <div style={{ padding: '20px 8px', textAlign: 'center', color: '#333', fontSize: 11 }}>
            {trades.length === 0 ? 'Waiting for trades…' : 'No trades above threshold'}
          </div>
        )}
      </div>
    </div>
  );
}

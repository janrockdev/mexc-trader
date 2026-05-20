import { useState } from 'react';

function StatRow({ label, value, valueColor }) {
  return (
    <div style={styles.statRow}>
      <span style={styles.statLabel}>{label}</span>
      <span style={{ ...styles.statValue, color: valueColor ?? '#c8a94e' }}>{value}</span>
    </div>
  );
}

function fmtPrice(p) {
  const n = +p;
  if (isNaN(n)) return '—';
  if (n >= 1000) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1)    return n.toFixed(4);
  return n.toFixed(6);
}

export default function TradingPanel({ symbol, ticker }) {
  const [side, setSide]       = useState('buy');
  const [orderType, setType]  = useState('market');
  const [price, setPrice]     = useState('');
  const [qty, setQty]         = useState('');
  const [submitted, setSubmit] = useState(null);

  const lastPrice = +(ticker?.lastPrice ?? ticker?.c ?? 0);

  const handleSubmit = (e) => {
    e.preventDefault();
    const order = {
      symbol,
      side,
      type: orderType,
      price: orderType === 'limit' ? +price : null,
      qty:   +qty,
      ts:    Date.now(),
    };
    // In demo mode, just display the order (no live execution)
    setSubmit(order);
    setQty('');
    setPrice('');
    setTimeout(() => setSubmit(null), 4000);
  };

  const estValue = qty && lastPrice ? (+qty * (orderType === 'limit' && price ? +price : lastPrice)) : null;

  return (
    <div className="panel" style={{ height: '100%' }}>
      {/* Header */}
      <div className="panel-header">
        <span className="panel-title">Trade {symbol}</span>
        <span style={{ fontSize: 9, color: '#444', fontStyle: 'italic' }}>DEMO MODE</span>
      </div>

      <div style={styles.body}>
        {/* Ticker summary */}
        {ticker && (
          <div style={styles.tickerSummary}>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#c8a94e', letterSpacing: '0.04em' }}>
              {fmtPrice(lastPrice)}
            </span>
            <span
              style={{
                fontSize: 11,
                marginLeft: 8,
                color: +(ticker.priceChangePercent ?? 0) >= 0 ? '#00e676' : '#ff3d57',
              }}
            >
              {+(ticker.priceChangePercent ?? 0) >= 0 ? '▲' : '▼'}
              {Math.abs(+(ticker.priceChangePercent ?? 0)).toFixed(2)}%
            </span>
          </div>
        )}

        {/* Buy / Sell toggle */}
        <div style={styles.sideToggle}>
          <button
            className={`btn ${side === 'buy' ? 'btn-buy btn-active' : ''}`}
            style={styles.sideBtn}
            onClick={() => setSide('buy')}
          >
            ▲ BUY
          </button>
          <button
            className={`btn ${side === 'sell' ? 'btn-sell btn-active' : ''}`}
            style={styles.sideBtn}
            onClick={() => setSide('sell')}
          >
            ▼ SELL
          </button>
        </div>

        {/* Order type */}
        <div style={styles.typeRow}>
          {['market', 'limit', 'stop'].map((t) => (
            <button
              key={t}
              className={`btn ${orderType === t ? 'btn-active' : ''}`}
              style={{ flex: 1, fontSize: 10, padding: '2px 4px' }}
              onClick={() => setType(t)}
            >
              {t.toUpperCase()}
            </button>
          ))}
        </div>

        <hr className="sep" />

        {/* Form */}
        <form onSubmit={handleSubmit} style={styles.form}>
          {orderType === 'limit' && (
            <div style={styles.field}>
              <label style={styles.fieldLabel}>PRICE (USDT)</label>
              <input
                className="terminal-input"
                type="number"
                step="any"
                min="0"
                placeholder={fmtPrice(lastPrice)}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required={orderType === 'limit'}
              />
            </div>
          )}
          {orderType === 'stop' && (
            <div style={styles.field}>
              <label style={styles.fieldLabel}>STOP PRICE (USDT)</label>
              <input
                className="terminal-input"
                type="number"
                step="any"
                min="0"
                placeholder="0.00"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
              />
            </div>
          )}

          <div style={styles.field}>
            <label style={styles.fieldLabel}>
              QUANTITY ({symbol.replace('USDT', '')})
            </label>
            <input
              className="terminal-input"
              type="number"
              step="any"
              min="0"
              placeholder="0.0000"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              required
            />
          </div>

          {/* Quick qty buttons */}
          <div style={styles.pctRow}>
            {['25%', '50%', '75%', '100%'].map((p) => (
              <button
                type="button"
                key={p}
                className="btn"
                style={{ flex: 1, fontSize: 9, padding: '2px 2px' }}
                onClick={() => {/* demo — no wallet */ }}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Estimated value */}
          <div style={styles.estRow}>
            <span className="text-dim" style={{ fontSize: 10 }}>Est. Value</span>
            <span style={{ fontSize: 11, color: '#c8a94e' }}>
              {estValue ? `≈ $${estValue.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '—'}
            </span>
          </div>

          <button
            type="submit"
            className={`btn ${side === 'buy' ? 'btn-buy' : 'btn-sell'}`}
            style={{ width: '100%', marginTop: 6, fontSize: 12, padding: '7px 0' }}
          >
            {side === 'buy' ? '▲ PLACE BUY ORDER' : '▼ PLACE SELL ORDER'}
          </button>
        </form>

        {/* Submission confirmation */}
        {submitted && (
          <div style={styles.confirmation}>
            <div style={{ color: '#ffeb3b', fontWeight: 700, fontSize: 11, marginBottom: 4 }}>
              ✓ ORDER SUBMITTED (DEMO)
            </div>
            <StatRow label="SYMBOL"    value={submitted.symbol} />
            <StatRow label="SIDE"      value={submitted.side.toUpperCase()} valueColor={submitted.side === 'buy' ? '#00e676' : '#ff3d57'} />
            <StatRow label="TYPE"      value={submitted.type.toUpperCase()} />
            {submitted.price && <StatRow label="PRICE"   value={fmtPrice(submitted.price)} />}
            <StatRow label="QTY"       value={submitted.qty} />
          </div>
        )}

        {/* Market stats */}
        {ticker && (
          <>
            <hr className="sep" />
            <StatRow label="24H OPEN"  value={fmtPrice(ticker.openPrice  ?? ticker.o ?? 0)} />
            <StatRow label="24H HIGH"  value={fmtPrice(ticker.highPrice  ?? ticker.h ?? 0)} valueColor="#00e676" />
            <StatRow label="24H LOW"   value={fmtPrice(ticker.lowPrice   ?? ticker.l ?? 0)} valueColor="#ff3d57" />
            <StatRow
              label="24H VOL"
              value={(+(ticker.volume ?? ticker.v ?? 0)).toLocaleString('en-US', { maximumFractionDigits: 0 })}
              valueColor="#888"
            />
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  body: {
    flex: 1,
    overflow: 'auto',
    padding: '8px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  tickerSummary: {
    display: 'flex',
    alignItems: 'baseline',
    paddingBottom: 4,
    borderBottom: '1px solid #111',
    marginBottom: 4,
  },
  sideToggle: {
    display: 'flex',
    gap: 4,
  },
  sideBtn: {
    flex: 1,
    fontSize: 11,
    fontWeight: 700,
    padding: '5px 4px',
  },
  typeRow: {
    display: 'flex',
    gap: 2,
    marginTop: 2,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  fieldLabel: {
    fontSize: 9,
    color: '#00bcd4',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
  },
  pctRow: {
    display: 'flex',
    gap: 2,
  },
  estRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '2px 0',
    borderTop: '1px solid #111',
    marginTop: 2,
  },
  confirmation: {
    background: 'rgba(0,230,118,0.05)',
    border: '1px solid rgba(0,230,118,0.2)',
    padding: '6px 8px',
    marginTop: 4,
  },
  statRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '1px 0',
  },
  statLabel: {
    fontSize: 10,
    color: '#555',
    letterSpacing: '0.06em',
  },
  statValue: {
    fontSize: 11,
    fontVariantNumeric: 'tabular-nums',
  },
};

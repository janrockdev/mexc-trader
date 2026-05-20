import { useState, useCallback, useRef } from 'react';

function fmt(v, d = 2) {
  const n = +v;
  if (isNaN(n) || n === 0) return '—';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (Math.abs(n) >= 1e3) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return n.toFixed(d);
}

const EMPTY_FORM = { symbol: '', qty: '', avgPrice: '' };

export default function Portfolio({ tickers = [], portfolio = [], onPortfolioChange }) {
  const [adding,  setAdding]  = useState(false);
  const [form,    setForm]    = useState(EMPTY_FORM);
  const [masked,  setMasked]  = useState(false);
  const symRef                = useRef(null);

  // Build a price map from live tickers
  const priceMap = new Map(
    tickers.map((t) => [t.symbol ?? t.s, +(t.lastPrice ?? t.c ?? 0)])
  );

  const rows = portfolio.map((pos) => {
    const current = priceMap.get(pos.symbol) ?? null;
    const pnl     = current !== null ? (current - pos.avgPrice) * pos.qty : null;
    const pnlPct  = current !== null && pos.avgPrice > 0
      ? ((current - pos.avgPrice) / pos.avgPrice) * 100
      : null;
    return { ...pos, current, pnl, pnlPct };
  });

  const totalPnl = rows.reduce((sum, r) => sum + (r.pnl ?? 0), 0);

  const handleRemove = useCallback((sym) => {
    onPortfolioChange?.(portfolio.filter((p) => p.symbol !== sym));
  }, [portfolio, onPortfolioChange]);

  const startAdding = useCallback(() => {
    setForm(EMPTY_FORM);
    setAdding(true);
    setTimeout(() => symRef.current?.focus(), 0);
  }, []);

  const handleConfirm = useCallback(() => {
    const raw   = form.symbol.trim().toUpperCase();
    const sym   = raw.endsWith('USDT') ? raw : raw + 'USDT';
    const qty   = parseFloat(form.qty);
    const avg   = parseFloat(form.avgPrice);
    if (!raw || isNaN(qty) || qty <= 0 || isNaN(avg) || avg <= 0) {
      setAdding(false);
      return;
    }
    // Merge with existing position if symbol already tracked
    const existing = portfolio.find((p) => p.symbol === sym);
    if (existing) {
      const totalQty  = existing.qty + qty;
      const blendedAvg = (existing.avgPrice * existing.qty + avg * qty) / totalQty;
      onPortfolioChange?.(
        portfolio.map((p) =>
          p.symbol === sym ? { symbol: sym, qty: totalQty, avgPrice: blendedAvg } : p
        )
      );
    } else {
      onPortfolioChange?.([...portfolio, { symbol: sym, qty, avgPrice: avg }]);
    }
    setAdding(false);
  }, [form, portfolio, onPortfolioChange]);

  const handleKey = useCallback((e) => {
    if (e.key === 'Enter')  handleConfirm();
    if (e.key === 'Escape') setAdding(false);
  }, [handleConfirm]);

  const setField = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  return (
    <div className="panel" style={styles.container}>
      <div className="panel-header">
        <span className="panel-title">Portfolio</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {rows.length > 0 && (
            <span
              className={`tabular ${totalPnl >= 0 ? 'text-green' : 'text-red'}`}
              style={{ fontSize: 10 }}
            >
              {masked ? '﹡﹡﹡﹡' : `${totalPnl >= 0 ? '+' : ''}${fmt(totalPnl)} USDT`}
            </span>
          )}
          <button
            title={masked ? 'Show values' : 'Hide values'}
            onClick={() => setMasked((v) => !v)}
            style={styles.eyeBtn}
          >{masked ? '○' : '◉'}</button>
          <button title="Add position" onClick={startAdding} style={styles.addBtn}>+</button>
        </div>
      </div>

      {/* ── Add-position form ── */}
      {adding && (
        <div style={styles.formRow}>
          <input
            ref={symRef}
            placeholder="Symbol"
            value={form.symbol}
            onChange={setField('symbol')}
            onKeyDown={handleKey}
            style={{ ...styles.input, width: 56 }}
          />
          <input
            placeholder="Qty"
            type="number"
            min="0"
            value={form.qty}
            onChange={setField('qty')}
            onKeyDown={handleKey}
            style={{ ...styles.input, width: 52 }}
          />
          <input
            placeholder="Avg $"
            type="number"
            min="0"
            value={form.avgPrice}
            onChange={setField('avgPrice')}
            onKeyDown={handleKey}
            style={{ ...styles.input, width: 56 }}
          />
          <button onClick={handleConfirm} style={styles.confirmBtn} title="Confirm">✓</button>
        </div>
      )}

      {/* ── Column headers ── */}
      {rows.length > 0 && (
        <div style={styles.headerRow}>
          <span style={{ ...styles.cell, flex: 0.7 }}>Symbol</span>
          <span style={{ ...styles.cell, ...styles.numCell }}>Qty</span>
          <span style={{ ...styles.cell, ...styles.numCell, flex: 1.4 }}>Avg $</span>
          <span style={{ ...styles.cell, ...styles.numCell, flex: 1.4 }}>PnL</span>
          <span style={{ width: 16 }} />
        </div>
      )}

      {/* ── Position rows ── */}
      <div style={styles.body}>
        {rows.length === 0 && !adding && (
          <div style={styles.empty}>No positions — press + to add</div>
        )}
        {rows.map(({ symbol, qty, avgPrice, current, pnl, pnlPct }) => {
          const up = (pnl ?? 0) >= 0;
          return (
            <div key={symbol} style={styles.row}>
              <div style={{ ...styles.cell, flex: 0.7 }}>
                <span className="text-amber font-600" style={{ fontSize: 11 }}>
                  {symbol.replace('USDT', '')}
                </span>
              </div>
              <div style={{ ...styles.cell, ...styles.numCell }}>
                <span className="tabular" style={{ fontSize: 10, color: '#ccc' }}>
                  {fmt(qty, qty < 1 ? 4 : 2)}
                </span>
              </div>
              <div style={{ ...styles.cell, ...styles.numCell, flex: 1.4 }}>
                <span className="tabular" style={{ fontSize: 10, color: '#999' }}>
                  {masked ? '●●●●' : fmt(avgPrice)}
                </span>
              </div>
              <div style={{ ...styles.cell, ...styles.numCell, flex: 1.4 }}>
                {masked ? (
                  <span className="tabular" style={{ fontSize: 10, color: '#555' }}>●●●●</span>
                ) : pnl !== null ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                    <span className={`tabular ${up ? 'text-green' : 'text-red'}`} style={{ fontSize: 10 }}>
                      {up ? '+' : ''}{fmt(pnl)}
                    </span>
                    <span className={`tabular ${up ? 'text-green' : 'text-red'}`} style={{ fontSize: 9, opacity: 0.7 }}>
                      {up ? '+' : ''}{pnlPct.toFixed(2)}%
                    </span>
                  </div>
                ) : (
                  <span style={{ fontSize: 10, color: '#444' }}>—</span>
                )}
              </div>
              <button
                title={`Remove ${symbol}`}
                onClick={() => handleRemove(symbol)}
                style={styles.removeBtn}
              >×</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
  },
  addBtn: {
    background: 'none',
    border: '1px solid #333',
    color: '#888',
    borderRadius: 3,
    width: 16,
    height: 16,
    fontSize: 14,
    cursor: 'pointer',
    padding: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: '14px',
  },
  eyeBtn: {
    background: 'none',
    border: 'none',
    color: '#555',
    fontSize: 11,
    cursor: 'pointer',
    padding: 0,
    lineHeight: 1,
  },
  formRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 6px',
    borderBottom: '1px solid #1a1a1a',
  },
  input: {
    background: '#111',
    border: '1px solid #333',
    borderRadius: 3,
    color: '#e0e0e0',
    fontSize: 10,
    padding: '2px 4px',
    outline: 'none',
  },
  confirmBtn: {
    background: 'none',
    border: '1px solid #2a4a2a',
    color: '#5a9a5a',
    borderRadius: 3,
    fontSize: 11,
    cursor: 'pointer',
    padding: '1px 4px',
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '2px 6px',
    borderBottom: '1px solid #1a1a1a',
  },
  cell: {
    fontSize: 9,
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  numCell: {
    flex: 1,
    textAlign: 'right',
    display: 'flex',
    justifyContent: 'flex-end',
  },
  body: {
    overflowY: 'auto',
  },
  empty: {
    fontSize: 10,
    color: '#444',
    textAlign: 'center',
    padding: '10px 8px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    padding: '3px 6px',
    borderBottom: '1px solid #0d0d0d',
  },
  removeBtn: {
    background: 'none',
    border: 'none',
    color: '#444',
    fontSize: 13,
    cursor: 'pointer',
    padding: '0 0 0 2px',
    flexShrink: 0,
    lineHeight: 1,
  },
};

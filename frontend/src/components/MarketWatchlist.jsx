import { useMemo, useState, useRef, useCallback } from 'react';

function fmt(v, d = 4) {
  const n = +v;
  if (isNaN(n)) return '—';
  if (n >= 1000) {
    return n.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
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

export default function MarketWatchlist({ tickers, activeSymbol, onSelect, watchlist = [], onWatchlistChange }) {
  const [adding, setAdding] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const inputRef = useRef(null);
  const dragIdx  = useRef(null);

  const handleDragStart = useCallback((e, idx) => {
    dragIdx.current = idx;
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e, idx) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIdx !== idx) setDragOverIdx(idx);
  }, [dragOverIdx]);

  const handleDrop = useCallback((e, idx) => {
    e.preventDefault();
    const from = dragIdx.current;
    setDragOverIdx(null);
    dragIdx.current = null;
    if (from === null || from === idx) return;
    const next = [...watchlist];
    const [moved] = next.splice(from, 1);
    next.splice(idx, 0, moved);
    onWatchlistChange?.(next);
  }, [watchlist, onWatchlistChange]);

  const handleDragEnd = useCallback(() => {
    dragIdx.current = null;
    setDragOverIdx(null);
  }, []);

  const rows = useMemo(() => {
    const map = new Map(tickers.map((t) => [t.symbol ?? t.s, t]));
    return watchlist.map((sym) => {
      const t = map.get(sym);
      if (!t) return { sym, price: null, pct: null, vol: null };
      const price = +(t.lastPrice ?? t.c ?? 0);
      const open  = +(t.openPrice ?? t.o ?? 0);
      const pct   = open ? ((price - open) / open) * 100 : 0;
      const vol   = +(t.quoteVolume ?? t.q ?? 0);
      return { sym, price, pct, vol };
    });
  }, [tickers, watchlist]);

  const handleRemove = useCallback((sym, e) => {
    e.stopPropagation();
    onWatchlistChange?.(watchlist.filter((s) => s !== sym));
  }, [watchlist, onWatchlistChange]);

  const handleAdd = useCallback(() => {
    const raw = inputVal.trim().toUpperCase();
    if (!raw) { setAdding(false); return; }
    const sym = raw.endsWith('USDT') ? raw : raw + 'USDT';
    if (!watchlist.includes(sym)) {
      onWatchlistChange?.([...watchlist, sym]);
    }
    setInputVal('');
    setAdding(false);
  }, [inputVal, watchlist, onWatchlistChange]);

  const handleInputKey = useCallback((e) => {
    if (e.key === 'Enter') handleAdd();
    if (e.key === 'Escape') { setAdding(false); setInputVal(''); }
  }, [handleAdd]);

  const startAdding = useCallback(() => {
    setAdding(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  return (
    <div className="panel" style={styles.container}>
      <div className="panel-header">
        <span className="panel-title">Watchlist</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="text-dim" style={{ fontSize: 10 }}>24H</span>
          <button
            title="Add symbol"
            onClick={startAdding}
            style={styles.addBtn}
          >+</button>
        </div>
      </div>

      {/* ── Add-symbol input ── */}
      {adding && (
        <div style={styles.addRow}>
          <input
            ref={inputRef}
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={handleInputKey}
            onBlur={handleAdd}
            placeholder="e.g. ETH or ETHUSDT"
            style={styles.addInput}
          />
        </div>
      )}

      <div className="panel-body" style={{ padding: 0 }}>
        {rows.map(({ sym, price, pct, vol }, idx) => {
          const up = (pct ?? 0) >= 0;
          const active = sym === activeSymbol;
          const isOver = dragOverIdx === idx;
          return (
            <div
              key={sym}
              draggable
              onDragStart={(e) => handleDragStart(e, idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDrop={(e) => handleDrop(e, idx)}
              onDragEnd={handleDragEnd}
              style={{
                ...styles.row,
                background: active ? 'rgba(200, 169, 78, 0.08)' : undefined,
                borderLeft: active ? '2px solid #c8a94e' : '2px solid transparent',
                borderTop: isOver ? '1px solid #c8a94e' : '1px solid transparent',
              }}
              onClick={() => onSelect(sym)}
            >
              <span style={styles.dragHandle} title="Drag to reorder">⠿</span>
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
              <button
                title={`Remove ${sym}`}
                onClick={(e) => handleRemove(sym, e)}
                style={styles.removeBtn}
              >×</button>
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
  addBtn: {
    background: 'none',
    border: '1px solid #333',
    color: '#888',
    borderRadius: 3,
    width: 16,
    height: 16,
    lineHeight: '14px',
    fontSize: 14,
    cursor: 'pointer',
    padding: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addRow: {
    padding: '4px 8px',
    borderBottom: '1px solid #1a1a1a',
  },
  addInput: {
    width: '100%',
    background: '#111',
    border: '1px solid #333',
    borderRadius: 3,
    color: '#e0e0e0',
    fontSize: 11,
    padding: '3px 6px',
    outline: 'none',
    boxSizing: 'border-box',
  },
  dragHandle: {
    color: '#333',
    fontSize: 13,
    cursor: 'grab',
    marginRight: 4,
    userSelect: 'none',
    flexShrink: 0,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '4px 4px 4px 4px',
    cursor: 'pointer',
    borderBottom: '1px solid #0d0d0d',
    transition: 'background 0.1s',
  },
  removeBtn: {
    background: 'none',
    border: 'none',
    color: '#444',
    fontSize: 14,
    lineHeight: 1,
    cursor: 'pointer',
    padding: '0 2px',
    flexShrink: 0,
    opacity: 0.6,
  },
  symName: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
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

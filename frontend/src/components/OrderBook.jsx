import { useMemo, useState, useCallback } from 'react';
import { useSettings } from '../hooks/useSettings.js';

const TICK_SIZES = [0.01, 0.1, 1, 10, 100];

/** Decimal places to display for a given tick size */
function tickDecimals(tickSize) {
  if (tickSize >= 1)    return 0;
  if (tickSize >= 0.1)  return 1;
  if (tickSize >= 0.01) return 2;
  return 3;
}

function fmtAggPrice(p, tickSize) {
  const n = +p;
  if (isNaN(n)) return '—';
  const dec = tickDecimals(tickSize);
  return n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtPrice(p) {
  const n = +p;
  if (isNaN(n)) return '—';
  if (n >= 1000) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1)    return n.toFixed(4);
  return n.toFixed(6);
}

function fmtVol(v) {
  const n = +v;
  if (isNaN(n)) return '—';
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 1 });
  if (n >= 1)    return n.toFixed(3);
  return n.toFixed(4);
}

/**
 * Bucket price levels into groups of `tickSize`, summing volumes.
 * side='bid' → sort descending; side='ask' → sort ascending.
 */
function aggregateLevels(levels, tickSize, side) {
  if (!levels.length) return levels;
  const dec = tickDecimals(tickSize);
  const buckets = new Map();
  for (const { price, vol } of levels) {
    const raw    = Math.floor(price / tickSize) * tickSize;
    const key    = raw.toFixed(dec);          // string key avoids float key collisions
    buckets.set(key, (buckets.get(key) ?? 0) + vol);
  }
  const arr = [...buckets.entries()].map(([k, vol]) => ({ price: +k, vol }));
  arr.sort((a, b) => side === 'bid' ? b.price - a.price : a.price - b.price);
  let cum = 0;
  return arr.map(({ price, vol }) => ({ price, vol, cum: (cum += vol) }));
}

/**
 * A single order row with a depth-bar background showing relative volume.
 */
function OrderRow({ price, vol, cum, maxVol, side, tickSize, isMaxVol }) {
  const pct   = maxVol > 0 ? (cum / maxVol) * 100 : 0;
  const isAsk = side === 'ask';

  return (
    <tr
      className="ob-row"
      style={isMaxVol ? {
        background: isAsk ? 'rgba(255,61,87,0.10)' : 'rgba(0,230,118,0.10)',
        outline: `1px solid ${isAsk ? 'rgba(255,61,87,0.35)' : 'rgba(0,230,118,0.35)'}`,
        outlineOffset: '-1px',
      } : undefined}
    >
      <td
        style={{
          position: 'relative',
          padding: '1px 8px',
          textAlign: 'right',
          color: isMaxVol ? (isAsk ? '#ff3d57' : '#00e676') : '#7a7a7a',
          fontWeight: isMaxVol ? 700 : undefined,
          fontSize: 11,
        }}
      >
        {fmtVol(vol)}
        {/* depth bar */}
        <span
          style={{
            position: 'absolute',
            top: 0,
            [isAsk ? 'left' : 'right']: 0,
            height: '100%',
            width: `${pct}%`,
            background: isAsk ? 'rgba(255,61,87,0.12)' : 'rgba(0,230,118,0.12)',
            pointerEvents: 'none',
          }}
        />
      </td>
      <td
        style={{
          padding: '1px 8px',
          textAlign: 'right',
          color: isAsk ? '#ff3d57' : '#00e676',
          fontSize: 11,
          fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {fmtAggPrice(price, tickSize)}
      </td>
    </tr>
  );
}

export default function OrderBook({ orderBook, ticker, onTickSizeChange }) {
  const { bids = [], asks = [] } = orderBook;
  const [settings, setSetting] = useSettings();
  const [tickSize, setTickSizeRaw] = useState(settings.obTickSize);

  const setTickSize = useCallback((t) => {
    setTickSizeRaw(t);
    setSetting('obTickSize', t);
  }, [setSetting]);

  const aggBids = useMemo(() => aggregateLevels(bids, tickSize, 'bid'), [bids, tickSize]);
  const aggAsks = useMemo(() => aggregateLevels(asks, tickSize, 'ask'), [asks, tickSize]);

  const maxBidVol = useMemo(() => (aggBids.length ? aggBids[aggBids.length - 1].cum : 0), [aggBids]);
  const maxAskVol = useMemo(() => (aggAsks.length ? aggAsks[aggAsks.length - 1].cum : 0), [aggAsks]);

  const peakBidVol = useMemo(() => Math.max(0, ...aggBids.map((b) => b.vol)), [aggBids]);
  const peakAskVol = useMemo(() => Math.max(0, ...aggAsks.map((a) => a.vol)), [aggAsks]);

  const midPrice = useMemo(() => {
    const best_bid = bids[0]?.price;
    const best_ask = asks[0]?.price;
    if (best_bid && best_ask) return (best_bid + best_ask) / 2;
    if (ticker)               return +(ticker.lastPrice ?? ticker.c ?? 0);
    return null;
  }, [bids, asks, ticker]);

  const spread = useMemo(() => {
    const b = bids[0]?.price;
    const a = asks[0]?.price;
    if (b && a) return (a - b).toFixed(tickDecimals(tickSize));
    return '—';
  }, [bids, asks, tickSize]);

  // Show max 15 levels per side
  const visibleAsks = aggAsks.slice(0, 15).reverse();
  const visibleBids = aggBids.slice(0, 15);

  return (
    <div className="panel" style={{ height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div className="panel-header" style={{ gap: 6 }}>
        <span className="panel-title">Order Book</span>
        <div style={{ display: 'flex', gap: 3, marginLeft: 'auto' }}>
          {TICK_SIZES.map((t) => {
            const active = tickSize === t;
            const label  = t >= 1 ? String(t) : t.toString();
            return (
              <button
                key={t}
                onClick={() => { setTickSize(t); onTickSizeChange?.(t); }}
                title={`Aggregate to ${t} tick`}
                style={{
                  background:    active ? 'rgba(200,169,78,0.15)' : 'transparent',
                  border:        `1px solid ${active ? '#c8a94e' : '#2a2a2a'}`,
                  color:         active ? '#c8a94e' : '#555',
                  fontSize:      9,
                  padding:       '1px 5px',
                  cursor:        'pointer',
                  borderRadius:  2,
                  letterSpacing: '0.04em',
                  fontFamily:    'inherit',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Column headers */}
      <div style={styles.colHeaders}>
        <span style={{ ...styles.colHead, textAlign: 'left' }}>VOL</span>
        <span style={{ ...styles.colHead, textAlign: 'right' }}>PRICE</span>
      </div>

      {/* Asks (reversed, best ask nearest to mid) */}
      <div style={styles.side}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {visibleAsks.map((a, i) => (
              <OrderRow key={i} {...a} side="ask" maxVol={maxAskVol} tickSize={tickSize} isMaxVol={a.vol === peakAskVol && peakAskVol > 0} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mid price / spread */}
      <div style={styles.midRow}>
        <span style={styles.midPrice}>
          {midPrice
            ? midPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })
            : '——'}
        </span>
        {ticker && (
          <span
            style={{
              fontSize: 10,
              marginLeft: 6,
              color: +(ticker.priceChangePercent ?? 0) >= 0 ? '#00e676' : '#ff3d57',
            }}
          >
            {+(ticker.priceChangePercent ?? 0) >= 0 ? '▲' : '▼'}
            {Math.abs(+(ticker.priceChangePercent ?? 0)).toFixed(2)}%
          </span>
        )}
        <span style={{ fontSize: 9, color: '#444', marginLeft: 8 }}>
          sprd {spread}
        </span>
      </div>

      {/* Bids */}
      <div style={styles.side}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {visibleBids.map((b, i) => (
              <OrderRow key={i} {...b} side="bid" maxVol={maxBidVol} tickSize={tickSize} isMaxVol={b.vol === peakBidVol && peakBidVol > 0} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer stats */}
      {ticker && (
        <div style={styles.footer}>
          <div style={styles.footerItem}>
            <span className="text-dim" style={{ fontSize: 9 }}>24H HIGH</span>
            <span style={{ fontSize: 11, color: '#00e676' }}>
              {fmtPrice(ticker.highPrice ?? ticker.h ?? 0)}
            </span>
          </div>
          <div style={styles.footerItem}>
            <span className="text-dim" style={{ fontSize: 9 }}>24H LOW</span>
            <span style={{ fontSize: 11, color: '#ff3d57' }}>
              {fmtPrice(ticker.lowPrice ?? ticker.l ?? 0)}
            </span>
          </div>
          <div style={styles.footerItem}>
            <span className="text-dim" style={{ fontSize: 9 }}>24H VOL</span>
            <span style={{ fontSize: 11, color: '#888' }}>
              {(+(ticker.volume ?? ticker.v ?? 0)).toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  colHeaders: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '2px 8px',
    borderBottom: '1px solid #111',
    background: '#050505',
  },
  colHead: {
    fontSize: 10,
    color: '#444',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  side: {
    flex: 1,
    overflow: 'hidden',
  },
  midRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '5px 8px',
    background: '#0d0d0d',
    borderTop: '1px solid #1a1a1a',
    borderBottom: '1px solid #1a1a1a',
    flexShrink: 0,
  },
  midPrice: {
    fontSize: 15,
    fontWeight: 700,
    color: '#c8a94e',
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '0.04em',
  },
  footer: {
    display: 'flex',
    borderTop: '1px solid #111',
    background: '#050505',
    flexShrink: 0,
  },
  footerItem: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '4px 4px',
    gap: 1,
    borderRight: '1px solid #111',
  },
};

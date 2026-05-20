import { useState, useEffect, useCallback, useMemo } from 'react';

const POLL_MS = 30_000;

function fmtAmt(v, d = 4) {
  const n = +v;
  if (isNaN(n) || n === 0) return '0';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return n.toFixed(d);
}

function fmtUsdt(v) {
  const n = +v;
  if (isNaN(n) || n === 0) return '—';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return '$' + n.toFixed(2);
}

function usdtValue(asset, free, locked, priceMap) {
  const qty = +free + +locked;
  if (asset === 'USDT' || asset === 'USDC' || asset === 'BUSD') return qty;
  const price = priceMap.get(asset + 'USDT') ?? 0;
  return qty * price;
}

function normalizeSymbol(sym = '') {
  return String(sym).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function inferSide(rawSide, rawType, qty) {
  const s = String(rawSide ?? '').toUpperCase();
  if (s.includes('LONG') || s.includes('BUY') || s === 'B') return 'B';
  if (s.includes('SHORT') || s.includes('SELL') || s === 'S') return 'S';

  const t = Number(rawType);
  if (t === 1) return 'B';
  if (t === 2) return 'S';

  if (qty < 0) return 'S';
  if (qty > 0) return 'B';
  return '—';
}

function pickNum(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v === undefined || v === null || v === '') continue;
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
  }
  return null;
}

export default function AccountStatus({ tickers = [] }) {
  const [balances,    setBalances]    = useState([]);
  const [positions,   setPositions]   = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);
  const [masked,      setMasked]      = useState(false);
  const [lastUpdate,  setLastUpdate]  = useState(null);
  const [closingIds,  setClosingIds]  = useState(new Set());

  const priceMap = useMemo(
    () => new Map(tickers.map((t) => [t.symbol ?? t.s, +(t.lastPrice ?? t.c ?? 0)])),
    [tickers]
  );

  // refresh has NO dependency on tickers — only fetches data, no price calculations
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [balRes, posRes] = await Promise.all([
        fetch('/api/market/futures-account'),
        fetch('/api/market/futures-positions'),
      ]);
      const [balJson, posJson] = await Promise.all([balRes.json(), posRes.json()]);
      if (balJson.error) throw new Error(balJson.error);
      if (posJson.error) throw new Error(posJson.error);

      const balData = balJson.data ?? balJson;
      const rawBals = Array.isArray(balData)
        ? balData
        : (balData.balances ?? balData.assets ?? []);

      const normalizedBalances = rawBals
        .map((b) => ({
          asset: b.asset ?? b.currency ?? b.coin ?? b.symbol ?? '',
          free: +(b.free ?? b.available ?? b.availableBalance ?? b.balance ?? b.walletBalance ?? 0),
          locked: +(b.locked ?? b.frozen ?? b.frozenBalance ?? 0),
          usdtValue: +(b.usdtValue ?? b.equity ?? b.totalEq ?? 0),
        }))
        .filter((b) => b.asset && (b.free > 0 || b.locked > 0 || b.usdtValue > 0));

      const posData = posJson.data ?? posJson;
      const rawPositions = Array.isArray(posData)
        ? posData
        : (posData.positions ?? posData.list ?? []);

      const normalizedPositions = rawPositions
        .map((p, idx) => {
          const qty = +(p.holdVol ?? p.vol ?? p.positionAmt ?? p.size ?? p.qty ?? p.positionQty ?? 0);
          const unrealizedDirect = pickNum(p, [
            'unrealizedPnl', 'unrealizedProfit', 'unrealisedPnl', 'holdProfit', 'floatingPnl',
          ]);
          const realizedDirect = pickNum(p, [
            'realizedPnl', 'realisedPnl', 'realised', 'realizedProfit', 'closeProfit', 'historyRealizedPnl', 'realisedProfit',
          ]);
          const totalPnl = pickNum(p, [
            'positionPnl', 'totalPnl', 'pnl', 'profit', 'positionProfit',
          ]);
          const realizedDerived = totalPnl !== null && unrealizedDirect !== null
            ? totalPnl - unrealizedDirect
            : null;

          return {
            id: p.positionId ?? p.id ?? p.orderId ?? `${p.symbol ?? 'pos'}-${idx}`,
            symbol: normalizeSymbol(p.symbol ?? p.contractCode ?? p.symbolName ?? ''),
            qty,
            entry: +(p.openAvgPrice ?? p.entryPrice ?? p.avgOpenPrice ?? p.avgPrice ?? p.price ?? 0),
            mark: +(p.markPrice ?? p.fairPrice ?? 0),
            margin: +(p.im ?? p.positionMargin ?? p.margin ?? p.initialMargin ?? p.posMargin ?? 0),
            leverage: +(p.leverage ?? p.lever ?? p.openLevel ?? 0),
            notional: +(p.positionValue ?? p.value ?? p.holdValue ?? p.notional ?? 0),
            // null means "missing", not 0.
            pnlRaw: unrealizedDirect,
            realizedRaw: realizedDirect ?? realizedDerived ?? 0,
            side: inferSide(p.side, p.positionType, qty),
          };
        })
        .filter((p) => p.symbol && Math.abs(p.qty) > 0);

      setBalances(normalizedBalances);
      setPositions(normalizedPositions);
      setLastUpdate(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []); // no tickers dependency — sort happens at render time below

  // Initial load + auto-poll
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const authIssue = error?.toLowerCase().includes('apikey') ||
                    error?.toLowerCase().includes('api-key') ||
                    error?.toLowerCase().includes('unauthorized') ||
                    error?.toLowerCase().includes('invalid key') ||
                    error?.toLowerCase().includes('signature') ||
                    error?.toLowerCase().includes('no permission');

  const totalUsdt = balances.reduce((sum, b) => {
    const v = b.usdtValue > 0 ? b.usdtValue : usdtValue(b.asset, b.free, b.locked, priceMap);
    return sum + v;
  }, 0);

  // Sort by USDT value at render time so it updates with live prices without refetching
  const sortedBalances = useMemo(
    () => [...balances].sort(
      (a, b) => usdtValue(b.asset, b.free, b.locked, priceMap)
              - usdtValue(a.asset, a.free, a.locked, priceMap)
    ),
    [balances, priceMap]
  );

  const closePosition = useCallback(async (p) => {
    const qty = Math.abs(Number(p.qty));
    if (!p?.symbol || !Number.isFinite(qty) || qty <= 0) return;

    setClosingIds((prev) => new Set(prev).add(String(p.id)));
    try {
      const resp = await fetch('/api/market/futures-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'close',
          symbol: p.symbol,
          positionSide: p.side,
          orderType: 'market',
          qty,
          openType: 2,
          positionId: Number(p.id),
        }),
      });
      const data = await resp.json();
      if (!resp.ok || data?.error || data?.success === false) {
        throw new Error(data?.error || data?.message || 'Close rejected');
      }
      await refresh();
    } catch (e) {
      setError(e.message || 'Failed to close position');
    } finally {
      setClosingIds((prev) => {
        const next = new Set(prev);
        next.delete(String(p.id));
        return next;
      });
    }
  }, [refresh]);

  return (
    <div className="panel" style={styles.container}>
      {/* ── Header ── */}
      <div className="panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="panel-title">Account</span>
          {positions.length > 0 && <span style={styles.badge}>{positions.length} POS</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {!error && totalUsdt > 0 && (
            <span className="tabular text-dim" style={{ fontSize: 10 }}>
              {masked ? '﹡﹡﹡﹡' : fmtUsdt(totalUsdt)}
            </span>
          )}
          <button
            title={masked ? 'Show values' : 'Hide values'}
            onClick={() => setMasked((v) => !v)}
            style={styles.eyeBtn}
          >{masked ? '○' : '◉'}</button>
          <button
            title="Refresh"
            onClick={refresh}
            style={{ ...styles.eyeBtn, opacity: loading ? 0.4 : 1 }}
            disabled={loading}
          >↻</button>
        </div>
      </div>

      {/* ── Error / no-key state ── */}
      {error && (
        <div style={styles.notice}>
          {authIssue
            ? 'Futures API permission missing. Enable futures read access for this API key (or use a futures-enabled key) in MEXC API settings.'
            : error}
        </div>
      )}

      {/* ── Wallet block ── */}
      {!error && (
        <div style={styles.walletSection}>
          <div className="panel-header" style={styles.sectionHeader}>
            <span className="panel-title" style={{ fontSize: 10 }}>Wallet</span>
          </div>
          <div style={styles.walletBody}>
          {balances.length === 0 && !loading && (
            <div style={styles.empty}>No balances</div>
          )}
          {sortedBalances.map(({ asset, free, locked }) => {
            const val = usdtValue(asset, free, locked, priceMap);
            const hasLocked = +locked > 0;
            return (
              <div key={asset} style={styles.row}>
                <span className="text-amber font-600" style={{ fontSize: 11, flex: '0 0 52px' }}>
                  {asset}
                </span>
                <div style={styles.amtCol}>
                  <span className="tabular" style={{ fontSize: 10, color: '#ccc' }}>
                    {masked ? '●●●●' : fmtAmt(+free + +locked)}
                  </span>
                  {hasLocked && !masked && (
                    <span className="tabular text-dim" style={{ fontSize: 9 }}>
                      {fmtAmt(locked)} locked
                    </span>
                  )}
                </div>
                <span className="tabular text-dim" style={{ fontSize: 10, textAlign: 'right', flex: '0 0 56px' }}>
                  {masked ? '●●●' : (val > 0 ? fmtUsdt(val) : '—')}
                </span>
              </div>
            );
          })}
          </div>
        </div>
      )}

      {/* ── Open Positions block ── */}
      {!error && (
        <div style={styles.positionsSection}>
          <div className="panel-header" style={styles.sectionHeader}>
            <span className="panel-title" style={{ fontSize: 10 }}>Open Positions</span>
          </div>
          <div style={styles.positionsBody}>
          {positions.length === 0 && !loading && (
            <div style={styles.empty}>No open positions</div>
          )}
          {/* Column headers */}
          {positions.length > 0 && (
            <div style={styles.orderHeader}>
              <span style={styles.hcell}>Symbol</span>
              <span style={{ ...styles.hcell, textAlign: 'center' }}>Side</span>
              <span style={{ ...styles.hcell, textAlign: 'right' }}>Entry</span>
              <span style={{ ...styles.hcell, textAlign: 'right' }}>Realised</span>
              <span style={{ ...styles.hcell, textAlign: 'right' }}>PnL</span>
              <span style={{ ...styles.hcell, flex: '0 0 14px', textAlign: 'center' }}>X</span>
            </div>
          )}
          {positions.map((p) => {
            const isLong = p.side === 'B';
            const marketPx = p.mark > 0 ? p.mark : (priceMap.get(p.symbol) ?? 0);
            // Prefer explicit notional; otherwise derive notional from margin*leverage.
            const notional = p.notional > 0
              ? p.notional
              : (p.margin > 0 && p.leverage > 0 ? p.margin * p.leverage : 0);
            // Fallback unrealized PnL for linear USDT contracts:
            // pnl = ((mark - entry) / entry) * notional for long (sign inverted for short).
            const fallbackNotionalPnl = p.entry > 0 && marketPx > 0 && notional > 0
              ? (((marketPx - p.entry) / p.entry) * notional * (isLong ? 1 : -1))
              : 0;
            const fallbackQtyPnl = p.entry > 0 && marketPx > 0
              ? (isLong ? (marketPx - p.entry) : (p.entry - marketPx)) * Math.abs(p.qty)
              : 0;
            const fallbackPnl = notional > 0 ? fallbackNotionalPnl : fallbackQtyPnl;
            const unrealized = p.pnlRaw !== null ? p.pnlRaw : fallbackPnl;
            const realized = p.realizedRaw || 0;
            // Display cumulative position PnL: unrealized + realized.
            const pnl = unrealized + realized;
            return (
              <div key={p.id} style={styles.orderRow}>
                <span className="text-amber" style={{ fontSize: 10, flex: '0 0 40px' }}>
                  {(p.symbol ?? '').replace('USDT', '')}
                </span>
                <span
                  className={`tabular font-600 ${isLong ? 'text-green' : 'text-red'}`}
                  style={{ fontSize: 10, flex: '0 0 28px', textAlign: 'center' }}
                >
                  {p.side}
                </span>
                <span className="tabular" style={{
                  fontSize: 10,
                  color: '#ccc',
                  flex: 1,
                  minWidth: 0,
                  textAlign: 'right',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {masked ? '●●●●' : (p.entry > 0 ? fmtAmt(p.entry, 2) : '—')}
                </span>
                <span className={`tabular ${(p.realizedRaw ?? 0) >= 0 ? 'text-green' : 'text-red'}`} style={{ fontSize: 10, flex: '0 0 52px', textAlign: 'right' }}>
                  {masked ? '●●●' : `${(p.realizedRaw ?? 0) >= 0 ? '+' : ''}${fmtAmt(p.realizedRaw ?? 0, 2)}`}
                </span>
                <span className={`tabular ${(pnl ?? 0) >= 0 ? 'text-green' : 'text-red'}`} style={{ fontSize: 10, flex: '0 0 48px', textAlign: 'right' }}>
                  {masked ? '●●●' : `${(pnl ?? 0) >= 0 ? '+' : ''}${fmtAmt(pnl, 2)}`}
                </span>
                <button
                  title="Close position"
                  onClick={() => closePosition(p)}
                  disabled={closingIds.has(String(p.id))}
                  style={styles.closeBtn}
                >
                  {closingIds.has(String(p.id)) ? '…' : '×'}
                </button>
              </div>
            );
          })}
          </div>
        </div>
      )}

      {lastUpdate && !error && (
        <div style={styles.footer}>
          Updated {lastUpdate.toLocaleTimeString()} · auto {POLL_MS / 1000}s
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    height: '100%',
    minHeight: 0,
    overflow: 'hidden',
  },
  badge: {
    background: '#c8a94e',
    color: '#000',
    borderRadius: 6,
    fontSize: 8,
    padding: '0 3px',
    marginLeft: 3,
    fontWeight: 700,
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
  notice: {
    fontSize: 9,
    color: '#666',
    padding: '6px 8px',
    lineHeight: 1.4,
  },
  section: {
    borderTop: '1px solid #1a1a1a',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  },
  walletSection: {
    borderTop: '1px solid #1a1a1a',
    flex: '0 0 auto',
  },
  positionsSection: {
    borderTop: '1px solid #1a1a1a',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    flex: 1,
  },
  sectionHeader: {
    padding: '3px 8px',
  },
  body: {
    overflowY: 'auto',
    maxHeight: 120,
  },
  walletBody: {
    overflowY: 'auto',
    maxHeight: 96,
  },
  positionsBody: {
    overflowY: 'auto',
    minHeight: 0,
    flex: 1,
  },
  empty: {
    fontSize: 10,
    color: '#444',
    textAlign: 'center',
    padding: '8px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    padding: '2px 6px',
    borderBottom: '1px solid #0d0d0d',
    gap: 4,
  },
  amtCol: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
  },
  orderHeader: {
    display: 'flex',
    padding: '2px 6px',
    borderBottom: '1px solid #1a1a1a',
    gap: 4,
  },
  hcell: {
    fontSize: 9,
    color: '#444',
    textTransform: 'uppercase',
    flex: 1,
  },
  orderRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '2px 6px',
    borderBottom: '1px solid #0d0d0d',
    gap: 4,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#777',
    fontSize: 12,
    cursor: 'pointer',
    width: 14,
    textAlign: 'center',
    padding: 0,
    lineHeight: 1,
    flex: '0 0 14px',
  },
  footer: {
    fontSize: 8,
    color: '#333',
    textAlign: 'right',
    padding: '2px 6px',
  },
};

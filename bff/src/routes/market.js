import { Router } from 'express';
import { MexcService } from '../services/mexc.js';

const router = Router();
const mexc = new MexcService();

function toContractSymbol(symbol = '') {
  const s = String(symbol).toUpperCase();
  if (s.includes('_')) return s;
  if (s.endsWith('USDT')) return `${s.slice(0, -4)}_USDT`;
  return s;
}

function errMessage(err) {
  return err?.response?.data?.message || err?.response?.data?.msg || err?.message || 'Upstream error';
}

// GET /api/market/ticker?symbol=BTCUSDT
router.get('/ticker', async (req, res) => {
  try {
    const { symbol } = req.query;
    if (!symbol) return res.status(400).json({ error: 'symbol is required' });
    const data = await mexc.getTicker(symbol);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/market/tickers (all 24hr tickers — filtered to top movers in frontend)
router.get('/tickers', async (req, res) => {
  try {
    const data = await mexc.getAllTickers();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/market/orderbook?symbol=BTCUSDT&limit=20
router.get('/orderbook', async (req, res) => {
  try {
    const { symbol, limit = 20 } = req.query;
    if (!symbol) return res.status(400).json({ error: 'symbol is required' });
    const data = await mexc.getOrderBook(symbol, limit);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/market/trades?symbol=BTCUSDT&limit=50
router.get('/trades', async (req, res) => {
  try {
    const { symbol, limit = 50 } = req.query;
    if (!symbol) return res.status(400).json({ error: 'symbol is required' });
    const data = await mexc.getRecentTrades(symbol, limit);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/market/klines?symbol=BTCUSDT&interval=1m&limit=200
router.get('/klines', async (req, res) => {
  try {
    const { symbol, interval = '1m', limit = 200 } = req.query;
    if (!symbol) return res.status(400).json({ error: 'symbol is required' });
    const data = await mexc.getKlines(symbol, interval, limit);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/market/account  — non-zero spot balances (requires API key)
router.get('/account', async (req, res) => {
  try {
    const data = await mexc.getAccountBalances();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/market/open-orders?symbol=BTCUSDT  — symbol optional (requires API key)
router.get('/open-orders', async (req, res) => {
  try {
    const { symbol } = req.query;
    const data = await mexc.getOpenOrders(symbol);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/market/futures-account  — futures wallet/assets (requires futures API perms)
router.get('/futures-account', async (_req, res) => {
  try {
    const data = await mexc.getFuturesAccountAssets();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: errMessage(err) });
  }
});

// GET /api/market/futures-positions  — open futures positions (requires futures API perms)
router.get('/futures-positions', async (_req, res) => {
  try {
    const data = await mexc.getFuturesOpenPositions();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: errMessage(err) });
  }
});

// POST /api/market/futures-order  — place futures order (requires futures order permission)
router.post('/futures-order', async (req, res) => {
  try {
    const {
      symbol,
      side = 'buy',
      action = 'open',
      positionSide,
      orderType = 'market',
      qty,
      price,
      leverage = 5,
      openType = 2,
      positionId,
    } = req.body ?? {};

    if (!symbol) return res.status(400).json({ error: 'symbol is required' });
    if (!Number.isFinite(+qty) || +qty <= 0) return res.status(400).json({ error: 'qty must be > 0' });

    let sideCode;
    if (String(action).toLowerCase() === 'close') {
      // 2 close short, 4 close long
      sideCode = String(positionSide).toUpperCase() === 'S' ? 2 : 4;
    } else {
      // 1 open long, 3 open short
      sideCode = String(side).toLowerCase() === 'sell' ? 3 : 1;
    }
    const typeCode = String(orderType).toLowerCase() === 'market' ? 5 : 1; // 5 market, 1 limit
    const px = Number.isFinite(+price) && +price > 0 ? +price : 0;

    const data = await mexc.placeFuturesOrder({
      symbol: toContractSymbol(symbol),
      price: px,
      vol: +qty,
      leverage: +leverage,
      side: sideCode,
      type: typeCode,
      openType: +openType,
      positionId: positionId ? +positionId : undefined,
    });

    if (data?.success === false) {
      return res.status(502).json({ error: data.message || 'Order rejected', data });
    }

    res.json(data);
  } catch (err) {
    res.status(502).json({ error: errMessage(err) });
  }
});

export default router;

import { Router } from 'express';
import { MexcService } from '../services/mexc.js';

const router = Router();
const mexc = new MexcService();

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

export default router;

import { Router } from 'express';
import marketRoutes from './market.js';

const router = Router();

router.use('/market', marketRoutes);

// Health check
router.get('/health', (_req, res) => res.json({ status: 'ok', ts: Date.now() }));

export default router;

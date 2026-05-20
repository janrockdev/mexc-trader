import express from 'express';
import http from 'http';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { config } from './config.js';
import routes from './routes/index.js';
import { MexcStream } from './services/stream.js';

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use('/api', routes);

// ── HTTP + WebSocket server ──────────────────────────────────────────────────
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const stream = new MexcStream();

wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  console.log(`[ws] Client connected from ${clientIp}`);

  // Immediately subscribe to mini-tickers for the ticker tape
  stream.subscribeTickers(ws);

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      switch (msg.type) {
        case 'subscribe':
          if (Array.isArray(msg.symbols)) stream.subscribe(msg.symbols, ws);
          break;
        case 'unsubscribe':
          if (Array.isArray(msg.symbols)) stream.unsubscribe(msg.symbols, ws);
          break;
        case 'setDepth':
          if (msg.symbol && Number.isFinite(msg.depth)) stream.setDepth(msg.symbol, msg.depth);
          break;
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
          break;
      }
    } catch { /* ignore malformed client messages */ }
  });

  ws.on('close', () => {
    console.log(`[ws] Client ${clientIp} disconnected`);
    stream.removeClient(ws);
  });

  ws.on('error', (err) => console.error('[ws] Client error:', err.message));

  ws.send(JSON.stringify({ type: 'connected', ts: Date.now() }));
});

// Keep-alive pings every 30 s
setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.readyState === ws.OPEN) ws.ping();
  }
}, 30_000);

server.listen(config.port, () => {
  console.log(`\n  MEXC BFF  →  http://localhost:${config.port}`);
  console.log(`  WebSocket →  ws://localhost:${config.port}/ws\n`);
});

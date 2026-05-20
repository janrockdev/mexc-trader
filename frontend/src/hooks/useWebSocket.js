import { useEffect, useRef, useCallback, useState } from 'react';

const BFF_WS_URL = 'ws://localhost:3001/ws';

/**
 * Persistent WebSocket connection to the BFF.
 * Automatically reconnects on disconnect.
 *
 * @param {(msg: object) => void} onMessage
 * @returns {{ send: (msg: object) => void, status: 'connected'|'disconnected'|'connecting' }}
 */
export function useWebSocket(onMessage) {
  const wsRef = useRef(null);
  const onMessageRef = useRef(onMessage);
  const reconnectTimer = useRef(null);
  const [status, setStatus] = useState('connecting');

  onMessageRef.current = onMessage;

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus('connecting');
    const ws = new WebSocket(BFF_WS_URL);

    ws.onopen = () => {
      setStatus('connected');
      clearTimeout(reconnectTimer.current);
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        onMessageRef.current?.(msg);
      } catch { /* ignore */ }
    };

    ws.onclose = () => {
      setStatus('disconnected');
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => ws.close();

    wsRef.current = ws;
  }, []);

  useEffect(() => {
    connect();
    // Keep-alive ping every 20 s
    const pingTimer = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }));
      }
    }, 20_000);

    return () => {
      clearInterval(pingTimer);
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((msg) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  return { send, status };
}

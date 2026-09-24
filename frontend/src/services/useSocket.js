import { useEffect, useRef, useCallback } from 'react';
import useAuthStore from '../store/authStore';

export function useSocket(onMessage) {
  const ws = useRef(null);
  const reconnectTimer = useRef(null);
  const onMessageRef = useRef(onMessage);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const connect = useCallback(() => {
    const token = useAuthStore.getState().accessToken;
    if (!token) return;

    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
    }

    if (ws.current) {
      ws.current.close();
    }

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    ws.current = new WebSocket(`${protocol}://${window.location.host}/ws?token=${token}`);

    ws.current.onopen = () => {
      console.log('[WS] Conectado');
    };

    ws.current.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        onMessageRef.current?.(data);
      } catch {}
    };

    ws.current.onclose = (e) => {
      console.log('[WS] Desconectado, código:', e.code);

      if (e.code !== 4001) {
        reconnectTimer.current = setTimeout(() => connect(), 3000);
      }
    };

    ws.current.onerror = () => {
      ws.current?.close();
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      ws.current?.close();
    };
  }, [connect]);

  return ws;
}

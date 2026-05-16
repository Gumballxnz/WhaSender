/**
 * WhaSender — Hook WebSocket com auto-reconnect
 */

import { useEffect, useRef, useCallback } from 'react';
import useAuthStore from '../store/authStore';

export function useSocket(onMessage) {
  const ws = useRef(null);
  const reconnectTimer = useRef(null);
  const onMessageRef = useRef(onMessage);

  // Manter referência atualizada do callback
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const connect = useCallback(() => {
    const token = useAuthStore.getState().accessToken;
    if (!token) return;

    // Limpar timer anterior
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
    }

    // Fechar conexão anterior
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
      // Reconectar após 3 segundos (exceto se foi fechamento intencional)
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

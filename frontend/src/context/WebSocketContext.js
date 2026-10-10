// src/context/WebSocketContext.js
// One socket for the whole app. Components subscribe to event types with useSocketEvent;
// every frame is delivered (a single "lastMessage" state would drop bursts).
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const WebSocketContext = createContext(null);

export const useWebSocket = () => useContext(WebSocketContext);

function defaultUrl() {
  if (process.env.REACT_APP_WS_URL) return process.env.REACT_APP_WS_URL;
  const { protocol, hostname, port } = window.location;
  // CRA dev server runs on 3000; the API/WebSocket server on 8080
  const targetPort = port === '3000' ? '8080' : port;
  return `${protocol === 'https:' ? 'wss' : 'ws'}://${hostname}${targetPort ? `:${targetPort}` : ''}`;
}

export const WebSocketProvider = ({ children }) => {
  const [status, setStatus] = useState('connecting'); // connecting | open | closed
  const wsRef = useRef(null);
  const listenersRef = useRef(new Map()); // type -> Set(handler)
  const attemptsRef = useRef(0);
  const timerRef = useRef(null);
  const disposedRef = useRef(false);

  const dispatch = useCallback((message) => {
    ['*', message.type].forEach((key) => {
      const set = listenersRef.current.get(key);
      if (set) set.forEach((handler) => {
        try { handler(message); } catch (err) { console.error('[ws] handler failed', err); }
      });
    });
  }, []);

  const connect = useCallback(() => {
    if (disposedRef.current) return;
    setStatus('connecting');
    const ws = new WebSocket(defaultUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      attemptsRef.current = 0;
      setStatus('open');
      dispatch({ type: 'socket_open' });
    };
    ws.onmessage = (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === 'ping') ws.send(JSON.stringify({ type: 'pong', timestamp: new Date() }));
      dispatch(message);
    };
    ws.onclose = () => {
      if (wsRef.current === ws) wsRef.current = null;
      if (disposedRef.current) return;
      setStatus('closed');
      const delay = Math.min(1000 * 2 ** attemptsRef.current, 30000);
      attemptsRef.current += 1;
      timerRef.current = setTimeout(connect, delay);
    };
    ws.onerror = () => ws.close();
  }, [dispatch]);

  useEffect(() => {
    disposedRef.current = false;
    connect();
    return () => {
      disposedRef.current = true;
      clearTimeout(timerRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  const subscribe = useCallback((type, handler) => {
    if (!listenersRef.current.has(type)) listenersRef.current.set(type, new Set());
    listenersRef.current.get(type).add(handler);
    return () => listenersRef.current.get(type)?.delete(handler);
  }, []);

  const send = useCallback((message) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(typeof message === 'string' ? message : JSON.stringify(message));
      return true;
    }
    return false;
  }, []);

  const value = useMemo(() => ({ status, isConnected: status === 'open', subscribe, send }), [status, subscribe, send]);

  return <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>;
};

/** Run `handler` for every event of `type` (or an array of types). */
export function useSocketEvent(types, handler) {
  const { subscribe } = useWebSocket();
  const ref = useRef(handler);
  ref.current = handler;
  const key = Array.isArray(types) ? types.join('|') : types;
  useEffect(() => {
    const list = key.split('|');
    const unsubs = list.map((t) => subscribe(t, (m) => ref.current(m)));
    return () => unsubs.forEach((u) => u());
  }, [key, subscribe]);
}

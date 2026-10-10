// src/hooks/useNow.js — a shared 1s clock for live wait timers and SLA countdowns
import { useEffect, useState } from 'react';

const listeners = new Set();
let timer = null;

function ensureTimer() {
  if (timer) return;
  timer = setInterval(() => {
    const now = Date.now();
    listeners.forEach((l) => l(now));
  }, 1000);
}

export default function useNow(enabled = true) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!enabled) return undefined;
    listeners.add(setNow);
    ensureTimer();
    return () => {
      listeners.delete(setNow);
      if (!listeners.size) { clearInterval(timer); timer = null; }
    };
  }, [enabled]);
  return now;
}

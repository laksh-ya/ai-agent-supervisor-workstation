// Loads the template library once and keeps it in sync via WebSocket events.
import { useCallback, useEffect, useState } from 'react';
import * as api from '../api';
import { useSocketEvent } from '../context/WebSocketContext';

export default function useTemplates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(() => api.getTemplates()
    .then((t) => { setTemplates(t); setError(null); })
    .catch((e) => setError(e.message))
    .finally(() => setLoading(false)), []);

  useEffect(() => { load(); }, [load]);

  useSocketEvent('template_created', (m) => setTemplates((prev) => (prev.some((t) => t.id === m.data.id) ? prev : [m.data, ...prev])));
  useSocketEvent('template_updated', (m) => setTemplates((prev) => prev.map((t) => (t.id === m.data.id ? { ...t, ...m.data } : t))));
  useSocketEvent('template_deleted', (m) => setTemplates((prev) => prev.filter((t) => t.id !== m.data.id)));
  useSocketEvent('system_update', (m) => { if (m.data?.reset) load(); });

  const upsertLocal = useCallback((t) => setTemplates((prev) => (prev.some((x) => x.id === t.id) ? prev.map((x) => (x.id === t.id ? t : x)) : [t, ...prev])), []);
  const removeLocal = useCallback((id) => setTemplates((prev) => prev.filter((t) => t.id !== id)), []);

  return { templates, loading, error, reload: load, upsertLocal, removeLocal };
}

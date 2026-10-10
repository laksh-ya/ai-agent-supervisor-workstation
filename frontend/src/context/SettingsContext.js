// src/context/SettingsContext.js — per-supervisor preferences (persisted locally)
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

const DEFAULTS = {
  currency: 'INR',
  companyName: 'ABC Company',
  supervisorName: 'Neha Prasad',
  alertToasts: true,
  autoRefresh: true,
  voiceLang: 'en-US'
};

const KEY = 'supervisor-workstation.settings';

function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return DEFAULTS;
  }
}

const SettingsContext = createContext(null);
export const useSettings = () => useContext(SettingsContext);

export const SettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState(load);

  const update = useCallback((patch) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
      return next;
    });
  }, []);

  const value = useMemo(() => ({ ...settings, update }), [settings, update]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
};

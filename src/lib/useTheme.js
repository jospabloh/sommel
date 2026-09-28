// Theme state (module 12, fixed 2026-09-28). Shares the localStorage key
// ('sommel-theme') and the three values ('light' | 'dark' | 'system') with
// index.html's pre-mount script — that script paints the first frame before
// React ever runs; this hook is what applies a change live afterward and
// keeps 'system' following prefers-color-scheme without a reload. Only a
// hook is exported from this file (never a hook + a component together) —
// same convention as src/lib/AuthContext.jsx, to keep react-refresh happy.
import { useCallback, useEffect, useState } from 'react';

const KEY = 'sommel-theme';

function readStored() {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

function resolve(pref) {
  if (pref !== 'system') return pref;
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'dark';
  }
}

function apply(resolved) {
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;
}

/** @returns {{ preference: 'light'|'dark'|'system', resolved: 'light'|'dark', setPreference: (p: 'light'|'dark'|'system') => void }} */
export function useTheme() {
  const [preference, setPreferenceState] = useState(readStored);
  const [resolved, setResolved] = useState(() => resolve(readStored()));

  const setPreference = useCallback((pref) => {
    setPreferenceState(pref);
    try {
      localStorage.setItem(KEY, pref);
    } catch {
      // Best-effort — the in-memory state still drives this session.
    }
  }, []);

  useEffect(() => {
    const next = resolve(preference);
    setResolved(next);
    apply(next);
  }, [preference]);

  // While 'system' is chosen, follow the OS preference live (contract §5 /
  // module 12: "con system la app sigue a prefers-color-scheme en vivo, sin
  // recargar").
  useEffect(() => {
    if (preference !== 'system') return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const next = resolve('system');
      setResolved(next);
      apply(next);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [preference]);

  return { preference, resolved, setPreference };
}

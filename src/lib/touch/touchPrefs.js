// Per-device touch-screen preferences (Ajustes > "Esta pantalla"). Stored in
// this browser only: a touch screen at the bar and a laptop at home differ.
import { useSyncExternalStore } from 'react';
import { DEFAULT_TOUCH_PREFS, TOUCH_PREFS_KEY, parseTouchPrefs } from './touchLogic';

function read() {
  try {
    return parseTouchPrefs(localStorage.getItem(TOUCH_PREFS_KEY));
  } catch {
    return { ...DEFAULT_TOUCH_PREFS };
  }
}

let current = read();
const listeners = new Set();

export function getTouchPrefs() {
  return current;
}

export function setTouchPrefs(patch) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(TOUCH_PREFS_KEY, JSON.stringify(current));
  } catch {
    // Blocked storage: the choice lasts until the page reloads.
  }
  listeners.forEach((fn) => fn());
}

function subscribe(fn) {
  listeners.add(fn);
  const onStorage = (e) => {
    if (e.key !== TOUCH_PREFS_KEY) return;
    current = read();
    fn();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener('storage', onStorage);
  };
}

export function useTouchPrefs() {
  return useSyncExternalStore(subscribe, getTouchPrefs, getTouchPrefs);
}

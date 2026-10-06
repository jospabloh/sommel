import { useEffect, useRef } from 'react';
import { callFn } from '@/lib/api';
import { getTerminalState, setUnlocked } from '@/lib/terminal/terminalStore';
import { lockNow } from '@/lib/terminal/lockNow';

// José, 2026-10-06: a terminal locks after 2 minutes without a touch. The
// 15-minute pass is renewed while the person keeps working, so a busy shift
// never gets kicked out; the server refuses an expired pass regardless.
export const TERMINAL_IDLE_MS = 2 * 60 * 1000;
const RENEW_EVERY_MS = 5 * 60 * 1000;
const TICK_MS = 5000;
const EVENTS = ['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll'];

export function useTerminalIdle(active) {
  const lastActivity = useRef(Date.now());
  const lastRenew = useRef(Date.now());

  useEffect(() => {
    if (!active) return undefined;
    lastActivity.current = Date.now();
    lastRenew.current = Date.now();
    const onActivity = () => {
      lastActivity.current = Date.now();
    };
    EVENTS.forEach((e) => globalThis.addEventListener(e, onActivity, { passive: true, capture: true }));

    const tick = setInterval(async () => {
      const now = Date.now();
      const { expiresAt } = getTerminalState();
      if (now - lastActivity.current >= TERMINAL_IDLE_MS || (expiresAt && Date.parse(expiresAt) <= now)) {
        lockNow();
        return;
      }
      if (now - lastRenew.current >= RENEW_EVERY_MS) {
        lastRenew.current = now;
        try {
          setUnlocked(await callFn('terminals', 'renew'));
        } catch {
          // A failed renew is not a lock: the pass is still valid for a while,
          // and a real refusal (terminal_locked) already locked the store.
        }
      }
    }, TICK_MS);

    return () => {
      clearInterval(tick);
      EVENTS.forEach((e) => globalThis.removeEventListener(e, onActivity, { capture: true }));
    };
  }, [active]);
}

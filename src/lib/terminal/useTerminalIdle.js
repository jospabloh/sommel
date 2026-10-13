import { useCallback, useEffect, useRef, useState } from 'react';
import { callFn } from '@/lib/api';
import { getTerminalState, setUnlocked } from '@/lib/terminal/terminalStore';
import { lockNow } from '@/lib/terminal/lockNow';
import { idleStatus } from '@/lib/terminal/idleLogic';

export { TERMINAL_IDLE_MS } from '@/lib/terminal/idleLogic';

// José, 2026-10-06: a terminal locks after 2 minutes without a touch. The
// 15-minute pass is renewed while the person keeps working, so a busy shift
// never gets kicked out; the server refuses an expired pass regardless.
// José, 2026-10-13: the last 30 seconds show "¿Mantener la sesión abierta?".
// Only "Sí" restarts the timer; a stray touch on the screen while the
// question is up does not, so a terminal left unattended still locks.
const RENEW_EVERY_MS = 5 * 60 * 1000;
const TICK_MS = 1000;
const EVENTS = ['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll'];

export function useTerminalIdle(active) {
  const lastActivity = useRef(Date.now());
  const lastRenew = useRef(Date.now());
  const warningRef = useRef(false);
  const [secondsLeft, setSecondsLeft] = useState(null);

  const keepOpen = useCallback(() => {
    lastActivity.current = Date.now();
    warningRef.current = false;
    setSecondsLeft(null);
  }, []);

  useEffect(() => {
    if (!active) {
      warningRef.current = false;
      setSecondsLeft(null);
      return undefined;
    }
    lastActivity.current = Date.now();
    lastRenew.current = Date.now();
    const onActivity = () => {
      if (!warningRef.current) lastActivity.current = Date.now();
    };
    EVENTS.forEach((e) => globalThis.addEventListener(e, onActivity, { passive: true, capture: true }));

    const tick = setInterval(async () => {
      const now = Date.now();
      const { expiresAt } = getTerminalState();
      const status = idleStatus(now, lastActivity.current);
      if (status.lock || (expiresAt && Date.parse(expiresAt) <= now)) {
        warningRef.current = false;
        setSecondsLeft(null);
        lockNow();
        return;
      }
      warningRef.current = status.warning;
      setSecondsLeft(status.warning ? status.secondsLeft : null);
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

  return { secondsLeft, keepOpen, lockNow };
}

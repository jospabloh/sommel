// Pure timing for the terminal's auto-lock (no imports, so Deno tests load
// it). José, 2026-10-06: lock after 2 minutes without a touch. José,
// 2026-10-13: 30 seconds before that, ask "¿mantener la sesión abierta?".
// The lock still lands at 2 minutes; the question only uses its last 30 s.
export const TERMINAL_IDLE_MS = 2 * 60 * 1000;
export const TERMINAL_WARN_MS = 30 * 1000;

/** Where the countdown is: `lock` once idle reaches the limit, `warning`
 *  (with whole seconds left) during the last TERMINAL_WARN_MS. */
export function idleStatus(now, lastActivity, idleMs = TERMINAL_IDLE_MS, warnMs = TERMINAL_WARN_MS) {
  const left = idleMs - (now - lastActivity);
  if (left <= 0) return { lock: true, warning: false, secondsLeft: 0 };
  if (left <= warnMs) return { lock: false, warning: true, secondsLeft: Math.ceil(left / 1000) };
  return { lock: false, warning: false, secondsLeft: null };
}

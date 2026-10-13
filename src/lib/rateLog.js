// "Hay muchas solicitudes seguidas" log, per device (2026-10-13). Base44
// rejects over-quota calls before they reach Sommel's functions, so nothing
// shows up in the function logs: the only record is the browser that got the
// 429. callFn appends here; Acerca shows it so the time and screen are known
// instead of guessed. No imports: tested in Deno (base44/tests/rate_log_test.ts).

export const RATE_LOG_KEY = 'sommel.rateLog';
export const RATE_LOG_MAX = 50;

/** Newest first, capped. Pure. */
export function appendRateEvent(list, event, max = RATE_LOG_MAX) {
  const prev = Array.isArray(list) ? list : [];
  return [event, ...prev].slice(0, max);
}

export function parseRateLog(raw) {
  try {
    const v = JSON.parse(raw ?? '[]');
    return Array.isArray(v) ? v.filter((e) => e && typeof e.at === 'string') : [];
  } catch {
    return [];
  }
}

export function readRateLog() {
  try {
    return parseRateLog(globalThis.localStorage?.getItem(RATE_LOG_KEY));
  } catch {
    return [];
  }
}

/** Never throws: logging must not turn a 429 into a different error. */
export function recordRateLimited({ endpoint, action, attempt, path, now = new Date() }) {
  try {
    const event = { at: now.toISOString(), endpoint, action, attempt, path };
    globalThis.localStorage?.setItem(RATE_LOG_KEY, JSON.stringify(appendRateEvent(readRateLog(), event)));
  } catch {
    // Blocked storage: nothing to keep.
  }
}

export function clearRateLog() {
  try {
    globalThis.localStorage?.removeItem(RATE_LOG_KEY);
  } catch {
    // ignore
  }
}

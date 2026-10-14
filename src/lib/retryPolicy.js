// When Base44 answers "too many requests" (429), READS retry on their own a
// couple of times. Writes only do when the server makes them idempotent
// (IDEMPOTENT_WRITES); any other write never does: a 429 can arrive after part of a write
// already happened, and retrying a payment or a punch could do it twice.
// No imports: tested in Deno (base44/tests/retry_policy_test.ts).

/** endpoint -> actions that only read. Anything not listed is never retried. */
export const READ_ACTIONS = {
  catalog: ['listProducts'],
  settings: ['billing', 'get'],
  session: ['listSessions'],
  reports: ['summary'],
  payments: ['splitPreview', 'summary'],
  attendance: ['roster', 'records'],
  terminals: ['whoAmI', 'list', 'renew'],
  stations: ['getConfig'],
  shifts: ['list', 'current'],
  security: ['listAlerts', 'listPhotos', 'getPhoto', 'approvers', 'listApprovals'],
  printing: ['queue', 'cloudList'],
  permissions: ['getProfile', 'getPerson'],
  inventory: ['list', 'movements'],
  manageStaff: ['list'],
  account: ['exportData'],
};

/**
 * Writes that are safe to repeat after a 429 because the server already
 * guards against doing them twice (2026-10-14, José: a 429 in the middle of a
 * cobro "no puede seguir pasando"):
 * - addPayment: the same idempotency_key answers with the payment it made;
 * - requestTicket: one ticket per order, paid amount and total (dedupe_key);
 * - markPrinted / markFailed: marking a job that is already marked is a no-op.
 * Never add a write here without that guarantee on the server.
 */
export const IDEMPOTENT_WRITES = {
  payments: ['addPayment', 'requestTicket'],
  printing: ['markPrinted', 'markFailed'],
};

/** Waits before each retry, in ms (plus up to 30 % jitter). */
export const RETRY_DELAYS_MS = [1500, 4000];

export function isRetryableRead(endpoint, action) {
  const list = Object.prototype.hasOwnProperty.call(READ_ACTIONS, endpoint) ? READ_ACTIONS[endpoint] : null;
  return Array.isArray(list) && list.includes(action);
}

/** Retried after a 429: a read, or a write the server makes idempotent. */
export function isRetryable(endpoint, action) {
  if (isRetryableRead(endpoint, action)) return true;
  const list = Object.prototype.hasOwnProperty.call(IDEMPOTENT_WRITES, endpoint) ? IDEMPOTENT_WRITES[endpoint] : null;
  return Array.isArray(list) && list.includes(action);
}

export function isRateLimited(status, code) {
  return status === 429 || code === 'rate_limited';
}

/** Delay before retry number `attempt` (0-based), or null when out of retries. */
export function retryDelay(attempt, random = Math.random) {
  if (attempt < 0 || attempt >= RETRY_DELAYS_MS.length) return null;
  const base = RETRY_DELAYS_MS[attempt];
  return Math.round(base + base * 0.3 * random());
}

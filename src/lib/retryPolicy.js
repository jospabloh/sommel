// When Base44 answers "too many requests" (429), READS retry on their own a
// couple of times. Writes never do: a 429 can arrive after part of a write
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
  security: ['listAlerts', 'listPhotos', 'getPhoto'],
  printing: ['queue'],
  permissions: ['getProfile'],
  inventory: ['list', 'movements'],
  manageStaff: ['list'],
  account: ['exportData'],
};

/** Waits before each retry, in ms (plus up to 30 % jitter). */
export const RETRY_DELAYS_MS = [1500, 4000];

export function isRetryableRead(endpoint, action) {
  const list = Object.prototype.hasOwnProperty.call(READ_ACTIONS, endpoint) ? READ_ACTIONS[endpoint] : null;
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

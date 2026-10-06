// Concurrency (2026-10-06): Base44 rate-limits operations per app, so the
// guard caches the bar and the permission profile for 20 s, and the client
// retries READS (never writes) when told to wait. Each test says why.
import { CACHE_MAX_ENTRIES, CACHE_TTL_MS, TtlCache, profileKey, routeWantsFresh } from '../../scripts/templates/_guard_logic.ts';
import { READ_ACTIONS, RETRY_DELAYS_MS, isRateLimited, isRetryableRead, retryDelay } from '../../src/lib/retryPolicy.js';

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg ?? 'assertEquals'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

Deno.test('the cache window is the 20 s José approved, no longer', () => {
  assertEquals(CACHE_TTL_MS, 20_000);
});

Deno.test('a cached value expires exactly at the TTL', () => {
  const c = new TtlCache<string>(1000);
  c.set('bar1', 'v', 0);
  assertEquals(c.get('bar1', 999), 'v');
  assertEquals(c.get('bar1', 1000), undefined);
  assertEquals(c.size, 0, 'expired entry is dropped');
});

Deno.test('a missing bar (null) is cached too, distinct from "not cached"', () => {
  const c = new TtlCache<string | null>(1000);
  c.set('gone', null, 0);
  assertEquals(c.get('gone', 1), null);
  assertEquals(c.get('never', 1), undefined);
});

Deno.test('the cache never grows past its cap (oldest goes first)', () => {
  const c = new TtlCache<number>(60_000, 3);
  for (let i = 0; i < 5; i++) c.set(`k${i}`, i, 0);
  assertEquals(c.size, 3);
  assertEquals(c.get('k0', 1), undefined);
  assertEquals(c.get('k4', 1), 4);
  assertEquals(CACHE_MAX_ENTRIES > 0, true);
});

Deno.test('saving permissions forgets every role of THAT bar only', () => {
  const c = new TtlCache<Record<string, boolean> | null>(60_000);
  c.set(profileKey('barA', 'staff'), { x: true }, 0);
  c.set(profileKey('barA', 'bar_admin'), null, 0);
  c.set(profileKey('barB', 'staff'), { x: false }, 0);
  c.delete('barA|');
  assertEquals(c.get(profileKey('barA', 'staff'), 1), undefined);
  assertEquals(c.get(profileKey('barA', 'bar_admin'), 1), undefined);
  assertEquals(c.get(profileKey('barB', 'staff'), 1), { x: false });
});

Deno.test('a bar key without the "|" deletes only that exact key', () => {
  const c = new TtlCache<number>(60_000);
  c.set('bar1', 1, 0);
  c.set('bar10', 10, 0);
  c.delete('bar1');
  assertEquals(c.get('bar1', 1), undefined);
  assertEquals(c.get('bar10', 1), 10);
});

Deno.test('only routes marked freshReads skip the cache', () => {
  const plain = () => Promise.resolve({});
  const fresh = Object.assign(() => Promise.resolve({}), { freshReads: true });
  assertEquals(routeWantsFresh(plain), false);
  assertEquals(routeWantsFresh(fresh), true);
  assertEquals(routeWantsFresh({ freshReads: true }), false, 'not a function');
});

Deno.test('writes are never retried on a 429 (a payment or a punch could happen twice)', () => {
  for (const [endpoint, action] of [
    ['payments', 'addPayment'], ['payments', 'voidPayment'], ['orders', 'addItems'], ['orders', 'send'],
    ['attendance', 'punch'], ['shifts', 'close'], ['shifts', 'addCashOut'], ['printing', 'claimNext'],
    ['printing', 'markPrinted'], ['terminals', 'unlock'], ['settings', 'update'], ['security', 'markSeen'],
  ]) {
    assertEquals(isRetryableRead(endpoint, action), false, `${endpoint}.${action}`);
  }
});

Deno.test('the screens that failed with "muchas solicitudes" retry their reads', () => {
  assertEquals(isRetryableRead('shifts', 'current'), true);
  assertEquals(isRetryableRead('printing', 'queue'), true);
  assertEquals(isRetryableRead('constructor', 'x'), false, 'no prototype keys');
});

Deno.test('every listed read action is a real name, no write sneaked in', () => {
  const writeish = /^(add|set|update|upsert|delete|remove|cancel|void|open|close|send|mark|claim|punch|unlock|lock|revoke|reset|correct|move|merge|toggle|link|reply|activate|reprint|retry|print|resend|request)(?=[A-Z]|$)/;
  for (const [endpoint, actions] of Object.entries(READ_ACTIONS)) {
    for (const a of actions) {
      if (writeish.test(a)) throw new Error(`${endpoint}.${a} looks like a write`);
    }
  }
});

Deno.test('rate limit is recognized by status or by code', () => {
  assertEquals(isRateLimited(429, 'x'), true);
  assertEquals(isRateLimited(0, 'rate_limited'), true);
  assertEquals(isRateLimited(500, 'internal_error'), false);
});

Deno.test('retries are bounded and wait longer each time', () => {
  assertEquals(retryDelay(0, () => 0), RETRY_DELAYS_MS[0]);
  assertEquals(retryDelay(1, () => 0), RETRY_DELAYS_MS[1]);
  assertEquals(retryDelay(RETRY_DELAYS_MS.length, () => 0), null);
  assertEquals(retryDelay(0, () => 1), Math.round(RETRY_DELAYS_MS[0] * 1.3));
  assertEquals(RETRY_DELAYS_MS[1] > RETRY_DELAYS_MS[0], true);
});

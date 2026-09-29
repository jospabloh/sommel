// deno test --allow-env base44/tests/bridge_test.ts
// Zero external imports: only the shared signer and the pure bridge logic.
import { signAs } from '../functions/acaciaControl/_acaciaSign.ts';
import {
  authorizeBridge,
  cleanRevokeIds,
  countByField,
  entityError,
  isUsageEntity,
  projectWineBar,
  revokePatch,
  sanitizeLicensePatch,
} from '../functions/acaciaControl/_bridge_logic.ts';

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(msg || `expected ${e}, got ${a}`);
}

const MASTER = 'test-master';
const NOW = 1_800_000_000_000;
const ENV = { secret: MASTER, slug: 'sommel' };

async function signed(slug: string, action = 'ping', params: Record<string, unknown> = {}, ts = NOW) {
  return { action, params, ts: String(ts), sig: await signAs(MASTER, slug, String(ts), action, params) };
}

Deno.test('a body signed with sommel\'s derived key is accepted', async () => {
  const g = await authorizeBridge(ENV, await signed('sommel'), NOW);
  assertEquals(g.ok, true);
});

Deno.test('a body signed by ANOTHER app is rejected (the point of module 15)', async () => {
  for (const other of ['stockflow', 'puntos', 'rumbo']) {
    const g = await authorizeBridge(ENV, await signed(other), NOW);
    assertEquals(g.ok, false, other);
    if (!g.ok) assertEquals(g.status, 401);
  }
});

Deno.test('a body signed with the bare master is rejected (legacy off)', async () => {
  // Reproduce the pre-module-15 signature: HMAC(master, message) with no derivation.
  const params = {};
  const message = `${NOW}.ping.{}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(MASTER), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  const sig = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, '0')).join('');
  const g = await authorizeBridge(ENV, { action: 'ping', params, ts: String(NOW), sig }, NOW);
  assertEquals(g.ok, false);
  if (!g.ok) assertEquals(g.status, 401);
});

Deno.test('tampered params or action invalidate the signature', async () => {
  const b = await signed('sommel', 'license.set', { id: 'a' });
  const g1 = await authorizeBridge(ENV, { ...b, params: { id: 'b' } }, NOW);
  const g2 = await authorizeBridge(ENV, { ...b, action: 'sessions.revoke' }, NOW);
  assertEquals([g1.ok, g2.ok], [false, false]);
});

Deno.test('stale and malformed timestamps are rejected', async () => {
  const stale = await authorizeBridge(ENV, await signed('sommel', 'ping', {}, NOW - 10 * 60_000), NOW);
  assertEquals(stale.ok, false);
  const nan = await authorizeBridge(ENV, { action: 'ping', params: {}, ts: 'abc', sig: 'x' }, NOW);
  assertEquals(nan.ok, false);
});

Deno.test('secrets unset FAIL CLOSED with 503, even for a valid signature', async () => {
  const body = await signed('sommel');
  for (const env of [{}, { secret: MASTER }, { slug: 'sommel' }, { secret: '', slug: 'sommel' }, { secret: MASTER, slug: null }]) {
    const g = await authorizeBridge(env, body, NOW);
    assertEquals(g.ok, false);
    if (!g.ok) assertEquals(g.status, 503);
  }
});

Deno.test('missing fields are 400, checked after configuration and before the signature', async () => {
  for (const b of [{}, null, { action: 'ping' }, { action: 'ping', ts: '1' }, { ts: '1', sig: 'x' }]) {
    const g = await authorizeBridge(ENV, b, NOW);
    assertEquals(g.ok, false);
    if (!g.ok) assertEquals(g.status, 400);
  }
  const arr = await authorizeBridge(ENV, { action: 'ping', params: [], ts: String(NOW), sig: 'x' }, NOW);
  if (arr.ok || arr.status !== 400) throw new Error('array params must be 400');
});

Deno.test('params default to {} and sign as {}', async () => {
  const sig = await signAs(MASTER, 'sommel', String(NOW), 'ping', {});
  const g = await authorizeBridge(ENV, { action: 'ping', ts: String(NOW), sig }, NOW);
  assertEquals(g.ok, true);
});

Deno.test('entityError pins each action to one entity', () => {
  assertEquals(entityError('WineBar', 'WineBar'), null);
  assertEquals(entityError('WineBar', 'User') !== null, true);
  assertEquals(entityError('AppSession', undefined) !== null, true);
});

Deno.test('license.set patch: only the four platform fields, validated', () => {
  assertEquals(sanitizeLicensePatch({ billing_status: 'active', plan: 'pro', current_period_end: '2026-11-01' }),
    { patch: { billing_status: 'active', plan: 'pro', current_period_end: '2026-11-01T00:00:00.000Z' } });
  assertEquals(sanitizeLicensePatch({ trial_end_at: null }), { patch: { trial_end_at: null } });
  for (const bad of [
    { owner_id: 'x' }, { name: 'x' }, { billing_status: 'gratis' }, { trial_end_at: 'nope' },
    { plan: 5 }, {}, null, [], 'x',
  ]) {
    assertEquals('error' in sanitizeLicensePatch(bad), true, JSON.stringify(bad));
  }
});

Deno.test('projectWineBar exposes license fields only', () => {
  const p = projectWineBar({ id: 'b', name: 'V', plan: 'pro', billing_status: 'trial', rfc: 'SECRET', ticket_header: 'h', corte_emails: ['a@b.c'] });
  assertEquals('rfc' in p || 'corte_emails' in p || 'ticket_header' in p, false);
  assertEquals(p.billing_status, 'trial');
  assertEquals(projectWineBar(null).id, null);
});

Deno.test('usage: allowlist and per-tenant counts without row data', () => {
  assertEquals(isUsageEntity('Order'), true);
  assertEquals(isUsageEntity('PermissionProfile'), false);
  assertEquals(countByField([{ tenant_id: 'a' }, { tenant_id: 'b' }, { tenant_id: 'a' }, {}], 'tenant_id'),
    [{ id: 'a', count: 2 }, { id: 'b', count: 1 }]);
});

Deno.test('sessions.revoke: ids cleaned, patch stamps revoked_at', () => {
  assertEquals(cleanRevokeIds(['a', 'a', '', 5, 'b']), ['a', 'b']);
  assertEquals(cleanRevokeIds('x'), []);
  assertEquals(revokePatch('2026-09-29T00:00:00.000Z', 'op@acaciaco.com.mx'),
    { revoked_at: '2026-09-29T00:00:00.000Z', revoked_by: 'op@acaciaco.com.mx' });
  assertEquals(revokePatch('t', 5).revoked_by, null);
});

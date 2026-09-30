// deno test --allow-env base44/tests/bridge_test.ts
// Zero external imports: only the shared signer and the pure bridge logic.
import { signAs } from '../functions/acaciaControl/_acaciaSign.ts';
import {
  authorizeBridge,
  barContacts,
  checkFollowup,
  cleanRevokeIds,
  countByField,
  entityError,
  isUsageEntity,
  projectWineBar,
  revokePatch,
  sanitizeLicensePatch,
  sanitizeTicketUpdate,
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

// ── tickets.update ──────────────────────────────────────────────────────────

Deno.test('tickets.update: a status change in Sommel\'s own enum passes', () => {
  // Mission Control's buildTicketStatus sends exactly this shape for sommel.
  assertEquals(
    sanitizeTicketUpdate({ entity: 'SupportTicket', id: 't1', patch: { status: 'cerrado' } }),
    { id: 't1', patch: { status: 'cerrado' } },
  );
});

Deno.test('tickets.update: anything but a valid status is refused', () => {
  const base = { entity: 'SupportTicket', id: 't1' };
  // English statuses belong to other apps; writing one would break the enum.
  assertEquals('error' in sanitizeTicketUpdate({ ...base, patch: { status: 'resolved' } }), true);
  // Only status: a signed body must not rewrite tenant_id, body or created_by_email.
  assertEquals('error' in sanitizeTicketUpdate({ ...base, patch: { status: 'cerrado', tenant_id: 'x' } }), true);
  assertEquals('error' in sanitizeTicketUpdate({ ...base, patch: {} }), true);
  // Pinned to SupportTicket: not a way to patch WineBar.
  assertEquals('error' in sanitizeTicketUpdate({ entity: 'WineBar', id: 't1', patch: { status: 'cerrado' } }), true);
  assertEquals('error' in sanitizeTicketUpdate({ entity: 'SupportTicket', patch: { status: 'cerrado' } }), true);
});

Deno.test('tickets.update: a reply is refused, since the bar has no thread to read it in', () => {
  const r = sanitizeTicketUpdate({
    entity: 'SupportTicket', id: 't1', patch: { status: 'en_proceso' },
    messageEntity: 'SupportTicketMessage', message: { body: 'hola' },
  });
  assertEquals('error' in r, true);
});

// ── tenants.contacts / emails.sendFollowup ──────────────────────────────────

const BARS = [
  { id: 'b1', name: 'Vindima', owner_id: 'u2' },
  { id: 'b2', name: 'Sin admin' },
  { id: 'b3', name: 'Archivado', archived_at: '2026-09-01T00:00:00Z' },
];
const USERS = [
  { id: 'u1', tenant_id: 'b1', app_role: 'bar_admin', email: 'Primero@x.mx', created_date: '2026-01-01' },
  { id: 'u2', tenant_id: 'b1', app_role: 'bar_admin', email: 'duena@x.mx', created_date: '2026-02-01' },
  { id: 'u3', tenant_id: 'b1', app_role: 'staff', email: 'staff@x.mx', created_date: '2025-01-01' },
  { id: 'u4', tenant_id: 'b3', app_role: 'bar_admin', email: 'fue@x.mx', created_date: '2026-01-01' },
];

Deno.test('contacts: the owner speaks for the bar; staff never does; archived bars are skipped', () => {
  assertEquals(barContacts(BARS, USERS), [
    { id: 'b1', name: 'Vindima', email: 'duena@x.mx' },
    { id: 'b2', name: 'Sin admin', email: null },
  ]);
});

Deno.test('contacts: without the owner among admins, the oldest bar_admin', () => {
  const bars = [{ id: 'b1', name: 'Vindima', owner_id: 'gone' }];
  assertEquals(barContacts(bars, USERS)[0].email, 'primero@x.mx');
});

const ALLOWED = { internal: ['h.josepablo@gmail.com'], contacts: ['duena@x.mx'] };
const MAIL = { subject: 'Tu licencia', html: '<p>hola</p>' };

Deno.test('followup: a bar contact may receive it, case-insensitive', () => {
  const r = checkFollowup({ ...MAIL, to: 'Duena@X.mx' }, ALLOWED);
  assertEquals('error' in r ? r : r.to, 'duena@x.mx');
});

Deno.test('followup: a signed body cannot email an arbitrary address', () => {
  const r = checkFollowup({ ...MAIL, to: 'cualquiera@gmail.com' }, ALLOWED);
  assertEquals('error' in r && r.status, 403);
  // Staff are not contacts either.
  assertEquals('error' in checkFollowup({ ...MAIL, to: 'staff@x.mx' }, ALLOWED), true);
});

Deno.test('followup: internal notices go only to ACACIA addresses', () => {
  assertEquals('error' in checkFollowup({ ...MAIL, to: 'soporte@acaciaco.com.mx', internal: true }, ALLOWED), false);
  assertEquals('error' in checkFollowup({ ...MAIL, to: 'h.josepablo@gmail.com', internal: true }, ALLOWED), false);
  // "internal" is not a bypass: a bar contact or a stranger is still refused.
  assertEquals('error' in checkFollowup({ ...MAIL, to: 'duena@x.mx', internal: true }, ALLOWED), true);
  assertEquals('error' in checkFollowup({ ...MAIL, to: 'x@acaciaco.com.mx.evil.io', internal: true }, ALLOWED), true);
});

Deno.test('followup: malformed requests are 400', () => {
  assertEquals((checkFollowup({ ...MAIL }, ALLOWED) as { status: number }).status, 400);
  assertEquals((checkFollowup({ ...MAIL, to: 'a@b.mx, c@d.mx' }, ALLOWED) as { status: number }).status, 400);
  // A newline in the subject is a header-injection attempt.
  assertEquals((checkFollowup({ to: 'duena@x.mx', subject: 'a\nBcc: x@y.z', html: 'h' }, ALLOWED) as { status: number }).status, 400);
  assertEquals((checkFollowup({ to: 'duena@x.mx', subject: 's', html: 'x'.repeat(200_001) }, ALLOWED) as { status: number }).status, 400);
});

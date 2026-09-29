// Deno tests for the session (module 20) pure logic. Zero external imports.
//   deno test --allow-env base44/tests/session_logic_test.ts
import {
  SESSION_STALE_AFTER_MS,
  canRevoke,
  cleanDeviceId,
  cleanDeviceName,
  effectiveStatus,
  heartbeatDecision,
  isRevoked,
  isStale,
  pickSessionSurvivor,
  planManage,
  revokePatchFor,
  toPublicSession,
} from '../functions/session/_session_logic.ts';
import {
  STALE_AFTER_MS,
  cronVerdict,
  purgePatch,
  rowRevoked,
  rowStale,
  selectStale,
} from '../functions/purgeStaleSessions/_purge_logic.ts';

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(msg || `expected ${e}, got ${a}`);
}

const NOW = Date.parse('2026-09-29T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3600_000).toISOString();

Deno.test('revoked by EITHER shape: status or revoked_at', () => {
  assertEquals(isRevoked({ status: 'revoked' }), true);
  assertEquals(isRevoked({ status: 'active', revoked_at: hoursAgo(1) }), true, 'Mission Control stamps only revoked_at');
  assertEquals(isRevoked({ status: 'passive' }), false);
  assertEquals(isRevoked({}), false, 'a legacy row with neither field is live');
  assertEquals(isRevoked(null), false);
  assertEquals(effectiveStatus({ status: 'active', revoked_at: hoursAgo(1) }), 'revoked');
  assertEquals(effectiveStatus({}), 'active');
});

Deno.test('heartbeat: 403-path only when revoked; foreign or missing ids are not_found', () => {
  assertEquals(heartbeatDecision({ user_id: 'u1', status: 'active' }, 'u1'), 'ok');
  assertEquals(heartbeatDecision({ user_id: 'u1', status: 'revoked' }, 'u1'), 'revoked');
  assertEquals(heartbeatDecision({ user_id: 'u1', revoked_at: hoursAgo(2) }, 'u1'), 'revoked');
  assertEquals(heartbeatDecision({ user_id: 'u2', status: 'revoked' }, 'u1'), 'not_found', 'no oracle on someone else');
  assertEquals(heartbeatDecision({ status: 'active' }, 'u1'), 'not_found', 'a row with no owner is nobody\'s');
  assertEquals(heartbeatDecision(undefined, 'u1'), 'not_found');
});

Deno.test('manageSession plan: reuse this device, demote the others, ignore revoked rows', () => {
  const rows = [
    { id: 'a', device_id: 'dev-aaaaaaaa', status: 'active' },
    { id: 'b', device_id: 'dev-bbbbbbbb', status: 'active' },
    { id: 'c', device_id: 'dev-cccccccc', status: 'passive' },
    { id: 'd', device_id: 'dev-dddddddd', status: 'active', revoked_at: hoursAgo(3) },
  ];
  assertEquals(planManage(rows, 'dev-bbbbbbbb'), { existingId: 'b', demoteIds: ['a'] });
  assertEquals(planManage(rows, 'dev-newdevice'), { existingId: null, demoteIds: ['a', 'b'] });
  // A revoked row for this very device never blocks a fresh login.
  assertEquals(planManage(rows, 'dev-dddddddd').existingId, null);
});

Deno.test('duplicate rows for one device converge on the oldest', () => {
  const dup = [
    { id: 'z', created_date: '2026-09-29T10:00:02.000Z' },
    { id: 'y', created_date: '2026-09-29T10:00:01.000Z' },
  ];
  assertEquals(pickSessionSurvivor(dup)?.id, 'y');
  assertEquals(pickSessionSurvivor([{ id: 'b', created_date: 'x' }, { id: 'a', created_date: 'x' }])?.id, 'a', 'id tiebreak');
  assertEquals(pickSessionSurvivor([]), null);
});

Deno.test('revokeSession: own rows, bar_admin of the SAME bar, platform; nobody else', () => {
  const row = { id: 's', user_id: 'target' };
  const staff = { id: 'staff', tenantId: 't1', appRole: 'staff', isPlatform: false };
  const admin = { id: 'adm', tenantId: 't1', appRole: 'bar_admin', isPlatform: false };
  const otherAdmin = { id: 'adm2', tenantId: 't2', appRole: 'bar_admin', isPlatform: false };
  const platform = { id: 'p', tenantId: null, appRole: null, isPlatform: true };
  assertEquals(canRevoke({ ...staff, id: 'target' }, row, 't1'), true, 'own session');
  assertEquals(canRevoke(staff, row, 't1'), false, 'staff cannot revoke a colleague');
  assertEquals(canRevoke(admin, row, 't1'), true);
  assertEquals(canRevoke(otherAdmin, row, 't1'), false, 'admin of another bar');
  assertEquals(canRevoke(admin, row, null), false, 'target with no bar');
  assertEquals(canRevoke(admin, row, undefined), false);
  assertEquals(canRevoke({ ...admin, tenantId: null }, row, null), false, 'null never equals null');
  assertEquals(canRevoke(platform, row, 't9'), true);
  assertEquals(canRevoke(admin, undefined, 't1'), false);
});

Deno.test('revoke writes BOTH shapes so Mission Control and the heartbeat agree', () => {
  const p = revokePatchFor('2026-09-29T12:00:00.000Z', 'a@x.mx');
  assertEquals(p, { status: 'revoked', revoked_at: '2026-09-29T12:00:00.000Z', revoked_by: 'a@x.mx' });
  assertEquals(isRevoked(p), true);
  assertEquals(rowRevoked(purgePatch('2026-09-29T12:00:00.000Z')), true);
  assertEquals(isRevoked(purgePatch('2026-09-29T12:00:00.000Z')), true);
});

Deno.test('input cleaning: device id is an opaque token, name is clipped', () => {
  assertEquals(cleanDeviceId('3f2b8c1e-aaaa-4bbb-8ccc-123456789abc'), '3f2b8c1e-aaaa-4bbb-8ccc-123456789abc');
  assertEquals(cleanDeviceId('short'), null);
  assertEquals(cleanDeviceId('has space in it!!'), null);
  assertEquals(cleanDeviceId({}), null);
  assertEquals(cleanDeviceName('  iPhone  '), 'iPhone');
  assertEquals(cleanDeviceName(''), 'Dispositivo desconocido');
  assertEquals(cleanDeviceName(42), 'Dispositivo desconocido');
  assertEquals(cleanDeviceName('x'.repeat(200)).length, 60);
});

Deno.test('purge threshold is 48 hours, exactly', () => {
  assertEquals(STALE_AFTER_MS, 48 * 3600_000);
  assertEquals(SESSION_STALE_AFTER_MS, STALE_AFTER_MS, 'both copies agree');
  assertEquals(rowStale({ last_seen: hoursAgo(47.9) }, NOW), false);
  assertEquals(rowStale({ last_seen: hoursAgo(48) }, NOW), false, 'exactly 48 h is not yet stale');
  assertEquals(rowStale({ last_seen: hoursAgo(48.1) }, NOW), true);
  assertEquals(rowStale({ last_seen: hoursAgo(49) }, NOW), true, 'the hand-set 49 h check from the standard');
});

Deno.test('purge reaps active AND passive, skips revoked, and never guesses without a timestamp', () => {
  const rows = [
    { id: 'active-old', status: 'active', last_seen: hoursAgo(72) },
    { id: 'passive-old', status: 'passive', last_seen: hoursAgo(72) },
    { id: 'fresh', status: 'active', last_seen: hoursAgo(1) },
    { id: 'already', status: 'revoked', last_seen: hoursAgo(100) },
    { id: 'mc-revoked', status: 'active', revoked_at: hoursAgo(90), last_active_at: hoursAgo(100) },
    { id: 'legacy-old', last_active_at: hoursAgo(60) },
    { id: 'legacy-fresh', last_active_at: hoursAgo(2), started_at: hoursAgo(300) },
    { id: 'no-timestamps' },
  ];
  assertEquals(selectStale(rows, NOW).map((r) => r.id), ['active-old', 'passive-old', 'legacy-old']);
});

Deno.test('a recent heartbeat on either field keeps a session alive', () => {
  assertEquals(isStale({ last_seen: hoursAgo(100), last_active_at: hoursAgo(1) }, NOW), false);
  assertEquals(isStale({ last_seen: hoursAgo(1), last_active_at: hoursAgo(100) }, NOW), false);
  assertEquals(isStale({ last_seen: hoursAgo(100), last_active_at: hoursAgo(90) }, NOW), true);
  assertEquals(isStale({}, NOW), false);
});

Deno.test('cron guard fails CLOSED: unset or blank secret is 503, never a pass', () => {
  assertEquals(cronVerdict(undefined, 'Bearer anything'), { ok: false, status: 503, code: 'cron_not_configured' });
  assertEquals(cronVerdict(null, null), { ok: false, status: 503, code: 'cron_not_configured' });
  assertEquals(cronVerdict('', 'Bearer '), { ok: false, status: 503, code: 'cron_not_configured' });
  assertEquals(cronVerdict('   ', 'Bearer    '), { ok: false, status: 503, code: 'cron_not_configured' });
});

Deno.test('cron guard: only the exact bearer passes', () => {
  assertEquals(cronVerdict('s3cret', 'Bearer s3cret').ok, true);
  assertEquals(cronVerdict('s3cret', 'Bearer s3cre').status, 401);
  assertEquals(cronVerdict('s3cret', 'Bearer s3cret2').status, 401);
  assertEquals(cronVerdict('s3cret', 's3cret').status, 401, 'no scheme');
  assertEquals(cronVerdict('s3cret', null).status, 401);
  assertEquals(cronVerdict('s3cret', undefined).status, 401);
});

Deno.test('public projection is flat, hides device_id, and marks the current device', () => {
  const row = {
    id: 's1', user_id: 'u', device_id: 'dev-aaaaaaaa', device_name: 'Mac', status: 'passive',
    last_seen: hoursAgo(3), started_at: hoursAgo(30), user_email: 'a@x.mx',
  };
  const pub = toPublicSession(row, 'dev-aaaaaaaa') as Record<string, unknown>;
  assertEquals(pub.is_current, true);
  assertEquals('device_id' in pub, false);
  assertEquals('user_email' in pub, false, 'own list does not repeat the user');
  assertEquals(toPublicSession(row, 'dev-other000', { withUser: true }).user_email, 'a@x.mx');
  assertEquals(toPublicSession({ id: 'l', device: 'Chrome · macOS', last_active_at: hoursAgo(1) }, null).device_name, 'Chrome · macOS');
});

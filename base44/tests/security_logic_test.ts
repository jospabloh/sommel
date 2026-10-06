// Anti PIN-sharing (photo + alerts): scripts/templates/_security.ts and the
// client's photo helpers. The point of each test is in its name: a photo must
// really disappear after its period, nobody's face is stored unless the admin
// asked, and an alert must not be lost nor repeated.
import * as sec from '../../scripts/templates/_security.ts';
import * as attendanceCopy from '../functions/attendance/_security.ts';
import * as terminalsCopy from '../functions/terminals/_security.ts';
import { photoToSend, scaledSize, MAX_PHOTO_CHARS as CLIENT_MAX } from '../../src/lib/camera/photoSize.js';
import { buildRoster } from '../functions/terminals/_terminal_logic.ts';

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg ?? 'assertEquals'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function assert(cond: unknown, msg = 'assert') {
  if (!cond) throw new Error(msg);
}

const NOW = Date.parse('2026-10-06T20:00:00Z');
const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const JPEG = 'data:image/jpeg;base64,' + 'A'.repeat(400) + '==';

Deno.test('client and server agree on the biggest photo accepted', () => {
  assertEquals(CLIENT_MAX, sec.MAX_PHOTO_CHARS);
});

Deno.test('the copies the functions run are the same module surface as the template', () => {
  assertEquals(Object.keys(attendanceCopy).sort(), Object.keys(sec).sort());
  assertEquals(Object.keys(terminalsCopy).sort(), Object.keys(sec).sort());
});

Deno.test('validatePhoto keeps only a small JPEG/WebP data URL', () => {
  assertEquals(sec.validatePhoto(JPEG), JPEG);
  assertEquals(sec.validatePhoto('data:image/webp;base64,AAAA'), 'data:image/webp;base64,AAAA');
  assertEquals(sec.validatePhoto(undefined), null);
  assertEquals(sec.validatePhoto(''), null);
  // Not an image the admin could open, or a script smuggled as one.
  assertEquals(sec.validatePhoto('data:image/svg+xml;base64,AAAA'), null);
  assertEquals(sec.validatePhoto('https://example.com/a.jpg'), null);
  assertEquals(sec.validatePhoto('data:image/jpeg;base64,AA"><script>'), null);
  assertEquals(sec.validatePhoto('data:image/jpeg;base64,' + 'A'.repeat(sec.MAX_PHOTO_CHARS)), null);
});

Deno.test('a photo expires after the retention period and a row without expiry counts as expired', () => {
  const exp = Date.parse(sec.photoExpiry(NOW));
  assertEquals(exp - NOW, sec.PHOTO_RETENTION_DAYS * DAY);
  assertEquals(sec.isExpired({ expires_at: new Date(exp - 1).toISOString() }, NOW + sec.PHOTO_RETENTION_DAYS * DAY), true);
  assertEquals(sec.isExpired({ expires_at: new Date(exp).toISOString() }, NOW), false);
  assertEquals(sec.isExpired({}, NOW), true);
  assertEquals(Date.parse(sec.alertExpiry(NOW)) - NOW, sec.ALERT_RETENTION_DAYS * DAY);
});

Deno.test('photoRequired only when the admin turned it on (strict true)', () => {
  assertEquals(sec.photoRequired({ photo_check: true }), true);
  assertEquals(sec.photoRequired({ photo_check: 'true' }), false);
  assertEquals(sec.photoRequired({}), false);
  assertEquals(sec.photoRequired(null), false);
});

Deno.test('otherTerminalsInUse: same person, another live terminal, inside the window', () => {
  const devices = [
    { id: 'here', name: 'Caja', unlocked_user_id: 'ana', unlocked_at: new Date(NOW - MIN).toISOString() },
    { id: 'barra', name: 'Barra', unlocked_user_id: 'ana', unlocked_at: new Date(NOW - 5 * MIN).toISOString() },
    { id: 'old', name: 'Vieja', unlocked_user_id: 'ana', unlocked_at: new Date(NOW - 11 * MIN).toISOString() },
    { id: 'rev', name: 'Revocada', unlocked_user_id: 'ana', unlocked_at: new Date(NOW - MIN).toISOString(), revoked_at: '2026-10-01T00:00:00Z' },
    { id: 'luis', name: 'Cocina', unlocked_user_id: 'luis', unlocked_at: new Date(NOW - MIN).toISOString() },
    { id: 'locked', name: 'Bloqueada', unlocked_user_id: null, unlocked_at: null },
  ];
  assertEquals(sec.otherTerminalsInUse(devices, { userId: 'ana', deviceId: 'here', nowMs: NOW }), [{ id: 'barra', name: 'Barra' }]);
});

Deno.test('unlockAlerts: each anomaly raises its own alert', () => {
  const base = { appRole: 'staff', photoRequired: false, photoGiven: false, onShift: true, usesChecador: true, otherTerminals: [], terminalName: 'Caja' };
  assertEquals(sec.unlockAlerts(base), []);
  assertEquals(sec.unlockAlerts({ ...base, photoRequired: true }).map((a) => a.kind), ['photo_missing']);
  assertEquals(sec.unlockAlerts({ ...base, photoRequired: true, photoGiven: true }), []);
  const two = sec.unlockAlerts({ ...base, otherTerminals: [{ name: 'Barra' }] });
  assertEquals(two.map((a) => a.kind), ['two_terminals']);
  assert(two[0].detail.includes('Barra') && two[0].detail.includes('Caja'));
  assertEquals(sec.unlockAlerts({ ...base, onShift: false }).map((a) => a.kind), ['off_shift_unlock']);
});

Deno.test('off-shift alert is only for staff of a bar that uses the checador', () => {
  const base = { appRole: 'staff', photoRequired: false, photoGiven: false, onShift: false, usesChecador: true, otherTerminals: [], terminalName: 'Caja' };
  assertEquals(sec.unlockAlerts({ ...base, appRole: 'bar_admin' }), []);
  assertEquals(sec.unlockAlerts({ ...base, usesChecador: false }), []);
  assertEquals(sec.usesChecador([{ clock_in: new Date(NOW - 3 * DAY).toISOString() }], NOW), true);
  assertEquals(sec.usesChecador([{ clock_in: new Date(NOW - 20 * DAY).toISOString() }], NOW), false);
  assertEquals(sec.usesChecador([], NOW), false);
});

Deno.test('punchAlerts: missing photo only when it was required', () => {
  assertEquals(sec.punchAlerts({ photoRequired: false, photoGiven: false, action: 'entrada' }), []);
  assertEquals(sec.punchAlerts({ photoRequired: true, photoGiven: true, action: 'entrada' }), []);
  const [a] = sec.punchAlerts({ photoRequired: true, photoGiven: false, action: 'salida' });
  assertEquals(a.kind, 'photo_missing');
  assert(a.detail.includes('salida'));
});

Deno.test('dedupeAlerts drops a repeat of an unseen recent alert, keeps one already seen or old', () => {
  const draft = [{ kind: 'off_shift_unlock' as const, detail: 'x' }];
  const recent = (o: object) => [{ kind: 'off_shift_unlock', created_at: new Date(NOW - 10 * MIN).toISOString(), seen_at: null, ...o }];
  assertEquals(sec.dedupeAlerts(draft, recent({}), NOW), []);
  assertEquals(sec.dedupeAlerts(draft, recent({ seen_at: '2026-10-06T19:55:00Z' }), NOW), draft);
  assertEquals(sec.dedupeAlerts(draft, recent({ created_at: new Date(NOW - 2 * 60 * MIN).toISOString() }), NOW), draft);
  assertEquals(sec.dedupeAlerts(draft, recent({ kind: 'photo_missing' }), NOW), draft);
});

function fakeSvc(rows: Record<string, any[]>) {
  const deleted: string[] = [];
  const created: any[] = [];
  const entity = (name: string) => ({
    filter: (q: Record<string, unknown>) => Promise.resolve((rows[name] ?? []).filter((r) => Object.entries(q).every(([k, v]) => r[k] === v))),
    delete: (id: string) => { deleted.push(id); return Promise.resolve({}); },
    create: (data: any) => { const row = { id: `${name}-${created.length + 1}`, ...data }; created.push({ name, ...row }); return Promise.resolve(row); },
  });
  return { svc: { entities: { PhotoCheck: entity('PhotoCheck'), SecurityAlert: entity('SecurityAlert') } }, deleted, created };
}

Deno.test('purgeExpired deletes only expired rows of that bar, at most a batch', async () => {
  const old = new Date(NOW - DAY).toISOString();
  const fresh = new Date(NOW + DAY).toISOString();
  const rows = [
    ...Array.from({ length: sec.PURGE_BATCH + 5 }, (_, i) => ({ id: `o${i}`, tenant_id: 'bar', expires_at: old })),
    { id: 'keep', tenant_id: 'bar', expires_at: fresh },
    { id: 'other', tenant_id: 'otro', expires_at: old },
  ];
  const { svc, deleted } = fakeSvc({ PhotoCheck: rows });
  const n = await sec.purgeExpired(svc, 'PhotoCheck', 'bar', NOW);
  assertEquals(n, sec.PURGE_BATCH);
  assert(!deleted.includes('keep') && !deleted.includes('other'));
});

Deno.test('savePhoto never stores a face the admin did not ask for', async () => {
  const { svc, created } = fakeSvc({});
  const id = await sec.savePhoto(svc, { tenantId: 'bar', person: { id: 'ana' }, personName: 'Ana', kind: 'unlock', photo: JPEG, nowMs: NOW });
  assertEquals(id, null);
  assertEquals(created.length, 0);
});

Deno.test('savePhoto stores a required photo with its expiry and cleans old ones', async () => {
  const { svc, created, deleted } = fakeSvc({ PhotoCheck: [{ id: 'gone', tenant_id: 'bar', expires_at: new Date(NOW - 1).toISOString() }] });
  const id = await sec.savePhoto(svc, {
    tenantId: 'bar', person: { id: 'ana', photo_check: true }, personName: 'Ana', kind: 'punch', photo: JPEG, attendanceId: 'att1', nowMs: NOW,
  });
  assert(id);
  assertEquals(created[0].image, JPEG);
  assertEquals(created[0].attendance_id, 'att1');
  assertEquals(Date.parse(created[0].expires_at) - NOW, sec.PHOTO_RETENTION_DAYS * DAY);
  assertEquals(deleted, ['gone']);
});

Deno.test('raiseAlerts writes new alerts and skips a recent unseen repeat', async () => {
  const { svc, created } = fakeSvc({
    SecurityAlert: [{ id: 'a1', tenant_id: 'bar', user_id: 'ana', kind: 'photo_missing', created_at: new Date(NOW - MIN).toISOString(), seen_at: null, expires_at: new Date(NOW + DAY).toISOString() }],
  });
  const n = await sec.raiseAlerts(svc, {
    tenantId: 'bar', userId: 'ana', userName: 'Ana', nowMs: NOW,
    drafts: [{ kind: 'photo_missing', detail: 'x' }, { kind: 'two_terminals', detail: 'y' }],
  });
  assertEquals(n, 1);
  assertEquals(created.map((c) => c.kind), ['two_terminals']);
  assertEquals(created[0].seen_at, null);
});

Deno.test('a failing backend never throws out of the writers (the unlock/punch must go on)', async () => {
  const boom = { entities: { PhotoCheck: { create: () => Promise.reject(new Error('x')), filter: () => Promise.reject(new Error('x')) }, SecurityAlert: { create: () => Promise.reject(new Error('x')), filter: () => Promise.reject(new Error('x')) } } };
  assertEquals(await sec.savePhoto(boom, { tenantId: 'b', person: { id: 'a', photo_check: true }, personName: 'A', kind: 'unlock', photo: JPEG, nowMs: NOW }), null);
  assertEquals(await sec.raiseAlerts(boom, { tenantId: 'b', userId: 'a', userName: 'A', drafts: [{ kind: 'photo_missing', detail: 'x' }], nowMs: NOW }), 0);
  assertEquals(await sec.purgeExpired(boom, 'PhotoCheck', 'b', NOW), 0);
});

Deno.test('client photo helpers: never upscale, refuse oversize', () => {
  assertEquals(scaledSize(640, 480), { width: 240, height: 180 });
  assertEquals(scaledSize(200, 100), { width: 200, height: 100 });
  assertEquals(scaledSize(0, 0), null);
  assertEquals(photoToSend(JPEG), JPEG);
  assertEquals(photoToSend('data:image/jpeg;base64,' + 'A'.repeat(CLIENT_MAX)), null);
  assertEquals(photoToSend(null), null);
});

Deno.test('the terminal roster tells the screen who needs a photo', () => {
  const people = buildRoster(
    [
      { id: 'ana', display_name: 'Ana', app_role: 'staff', tenant_id: 'bar', photo_check: true },
      { id: 'luis', display_name: 'Luis', app_role: 'staff', tenant_id: 'bar' },
    ],
    { tenantId: 'bar', allows: () => true, withPin: new Set(['ana', 'luis']), onShift: new Set() }
  );
  assertEquals(Object.fromEntries(people.map((p) => [p.id, p.photo_check])), { ana: true, luis: false });
});

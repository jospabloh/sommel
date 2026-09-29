// Deno tests for base44/functions/attendance/handlers/_logic.ts and _pin.ts
// (zero external imports; localDayRange comes from the guard's pure logic).
//   deno test --allow-env base44/tests/attendance_logic_test.ts
import {
  LogicError,
  buildCorrection,
  decidePunch,
  displayName,
  isForgotten,
  isValidPin,
  lockMinutesLeft,
  normalizeNote,
  overlapsRange,
  recordMinutes,
  registerFailure,
  totalsByPerson,
  validateDateRange,
  validatePin,
} from '../functions/attendance/handlers/_logic.ts';
import { constantTimeEqual, hashPin, verifyPin } from '../functions/attendance/handlers/_pin.ts';
import { localDayRange } from '../../scripts/templates/_guard_logic.ts';

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(msg || `expected ${e}, got ${a}`);
}
function assertCode(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (err) {
    if (err instanceof LogicError && err.code === code) return;
    throw new Error(`expected LogicError ${code}, got ${err}`);
  }
  throw new Error(`expected LogicError ${code}, nothing thrown`);
}

const T = (iso: string) => Date.parse(iso);

// ---- PIN hashing ----------------------------------------------------------

Deno.test('hashPin / verifyPin roundtrip', async () => {
  const { salt, pin_hash } = await hashPin('4821');
  assertEquals(salt.length, 32);
  assertEquals(pin_hash.length, 64);
  assertEquals(await verifyPin('4821', salt, pin_hash), true);
});

Deno.test('verifyPin rejects a wrong pin and broken stored data', async () => {
  const { salt, pin_hash } = await hashPin('4821');
  assertEquals(await verifyPin('4822', salt, pin_hash), false);
  assertEquals(await verifyPin('4821', 'zz', pin_hash), false);
  assertEquals(await verifyPin('4821', salt, ''), false);
});

Deno.test('same pin gets a different salt and hash each time', async () => {
  const a = await hashPin('1234');
  const b = await hashPin('1234');
  assertEquals(a.salt === b.salt, false);
  assertEquals(a.pin_hash === b.pin_hash, false);
});

Deno.test('constantTimeEqual', () => {
  assertEquals(constantTimeEqual('abc', 'abc'), true);
  assertEquals(constantTimeEqual('abc', 'abd'), false);
  assertEquals(constantTimeEqual('abc', 'abcd'), false);
  assertEquals(constantTimeEqual('', ''), true);
});

// ---- PIN format, names ----------------------------------------------------

Deno.test('pin format is 4 to 6 digits', () => {
  for (const ok of ['1234', '12345', '123456', '0000']) assertEquals(isValidPin(ok), true, ok);
  for (const bad of ['123', '1234567', '12a4', '', ' 1234', 1234, null]) assertEquals(isValidPin(bad), false, String(bad));
  assertCode(() => validatePin('12'), 'invalid_pin');
});

Deno.test('displayName falls back to the email local part', () => {
  assertEquals(displayName({ full_name: ' Karla Ruiz ', email: 'k@x.com' }), 'Karla Ruiz');
  assertEquals(displayName({ full_name: '', email: 'karla@x.com' }), 'karla');
  assertEquals(displayName({}), 'Sin nombre');
});

// ---- Lockout --------------------------------------------------------------

Deno.test('lockout: the 5th consecutive failure locks 15 min and resets the counter', () => {
  const now = T('2026-09-29T20:00:00Z');
  let attempts = 0;
  for (let i = 1; i <= 4; i++) {
    const r = registerFailure(attempts, now);
    assertEquals(r.locked, false);
    assertEquals(r.failed_attempts, i);
    assertEquals(r.locked_until, null);
    attempts = r.failed_attempts;
  }
  const fifth = registerFailure(attempts, now);
  assertEquals(fifth.locked, true);
  assertEquals(fifth.failed_attempts, 0);
  assertEquals(fifth.locked_until, '2026-09-29T20:15:00.000Z');
});

Deno.test('lockMinutesLeft rounds up and is 0 once expired', () => {
  const now = T('2026-09-29T20:00:00Z');
  assertEquals(lockMinutesLeft('2026-09-29T20:15:00.000Z', now), 15);
  assertEquals(lockMinutesLeft('2026-09-29T20:00:30.000Z', now), 1);
  assertEquals(lockMinutesLeft('2026-09-29T19:59:00.000Z', now), 0);
  assertEquals(lockMinutesLeft(null, now), 0);
});

// ---- Toggle, double tap ---------------------------------------------------

Deno.test('punch with no records is an entrada', () => {
  assertEquals(decidePunch([], T('2026-09-29T20:00:00Z')).kind, 'entrada');
});

Deno.test('punch with an open record closes it (salida)', () => {
  const open = { id: 'a', clock_in: '2026-09-29T14:00:00Z', clock_out: null };
  const d = decidePunch([open], T('2026-09-29T22:00:00Z'));
  assertEquals(d.kind, 'salida');
  assertEquals((d as any).record.id, 'a');
});

Deno.test('punch after a closed record opens a new entrada', () => {
  const closed = { id: 'a', clock_in: '2026-09-29T14:00:00Z', clock_out: '2026-09-29T18:00:00Z' };
  assertEquals(decidePunch([closed], T('2026-09-29T20:00:00Z')).kind, 'entrada');
});

Deno.test('double tap: under 60 s after an entrada returns the same record', () => {
  const open = { id: 'a', clock_in: '2026-09-29T14:00:00Z', clock_out: null };
  const d = decidePunch([open], T('2026-09-29T14:00:59Z'));
  assertEquals(d.kind, 'double_tap');
  assertEquals((d as any).action, 'entrada');
  assertEquals((d as any).record.id, 'a');
  // At exactly 60 s it is a real salida.
  assertEquals(decidePunch([open], T('2026-09-29T14:01:00Z')).kind, 'salida');
});

Deno.test('double tap: under 60 s after a salida returns that salida', () => {
  const closed = { id: 'a', clock_in: '2026-09-29T14:00:00Z', clock_out: '2026-09-29T18:00:00Z' };
  const d = decidePunch([closed], T('2026-09-29T18:00:30Z'));
  assertEquals(d.kind, 'double_tap');
  assertEquals((d as any).action, 'salida');
});

Deno.test('punch ignores a forgotten open record and opens a new entrada', () => {
  const forgotten = { id: 'a', clock_in: '2026-09-28T14:00:00Z', clock_out: null };
  const now = T('2026-09-29T14:00:00Z'); // 24 h later
  assertEquals(decidePunch([forgotten], now).kind, 'entrada');
  // A live open record next to a forgotten one is the one that closes.
  const live = { id: 'b', clock_in: '2026-09-29T13:00:00Z', clock_out: null };
  const d = decidePunch([forgotten, live], now);
  assertEquals(d.kind, 'salida');
  assertEquals((d as any).record.id, 'b');
});

// ---- Forgotten exit -------------------------------------------------------

Deno.test('forgotten: open for more than 16 h', () => {
  const now = T('2026-09-30T08:00:00Z');
  assertEquals(isForgotten({ clock_in: '2026-09-29T16:00:00Z' }, now), false); // exactly 16 h
  assertEquals(isForgotten({ clock_in: '2026-09-29T15:59:00Z' }, now), true);
  assertEquals(isForgotten({ clock_in: '2026-09-29T10:00:00Z', clock_out: '2026-09-29T11:00:00Z' }, now), false);
});

// ---- Minutes and totals ---------------------------------------------------

Deno.test('recordMinutes: closed, open, forgotten', () => {
  const now = T('2026-09-29T20:00:00Z');
  assertEquals(recordMinutes({ clock_in: '2026-09-29T14:00:00Z', clock_out: '2026-09-29T15:30:45Z' }, now), 90);
  assertEquals(recordMinutes({ clock_in: '2026-09-29T19:00:00Z' }, now), 60);
  assertEquals(recordMinutes({ clock_in: '2026-09-28T10:00:00Z' }, now), 0);
});

Deno.test('totals across midnight are clipped to each local day', () => {
  // Bar time is UTC-6: 22:00 local on the 29th = 04:00Z on the 30th.
  const rec = { user_id: 'u1', user_name: 'Karla', clock_in: '2026-09-30T04:00:00Z', clock_out: '2026-09-30T08:00:00Z' }; // 22:00 -> 02:00 local
  const now = T('2026-10-05T00:00:00Z');
  const day29 = localDayRange('2026-09-29');
  const day30 = localDayRange('2026-09-30');
  const clip = (d: { fromISO: string; toISO: string }) => ({ fromMs: T(d.fromISO), toMs: T(d.toISO) });
  assertEquals(totalsByPerson([rec], now, clip(day29))[0].minutes, 120);
  assertEquals(totalsByPerson([rec], now, clip(day30))[0].minutes, 120);
  // Both days together: the whole 4 h.
  const both = { fromMs: T(day29.fromISO), toMs: T(day30.toISO) };
  assertEquals(totalsByPerson([rec], now, both)[0].minutes, 240);
  assertEquals(overlapsRange(rec, now, T(day29.fromISO), T(day29.toISO)), true);
  assertEquals(overlapsRange(rec, now, T(localDayRange('2026-09-28').fromISO), T(localDayRange('2026-09-28').toISO)), false);
});

Deno.test('totalsByPerson sums per person, flags open, sorts by name', () => {
  const now = T('2026-09-29T20:00:00Z');
  const clip = { fromMs: T('2026-09-29T06:00:00Z'), toMs: T('2026-09-30T06:00:00Z') };
  const recs = [
    { user_id: 'b', user_name: 'Beto', clock_in: '2026-09-29T14:00:00Z', clock_out: '2026-09-29T16:00:00Z' },
    { user_id: 'a', user_name: 'Ana', clock_in: '2026-09-29T14:00:00Z', clock_out: '2026-09-29T15:00:00Z' },
    { user_id: 'a', user_name: 'Ana', clock_in: '2026-09-29T19:00:00Z', clock_out: null },
  ];
  assertEquals(totalsByPerson(recs, now, clip), [
    { user_id: 'a', name: 'Ana', minutes: 120, open: true },
    { user_id: 'b', name: 'Beto', minutes: 120, open: false },
  ]);
});

// ---- Range ----------------------------------------------------------------

Deno.test('validateDateRange', () => {
  assertEquals(validateDateRange('2026-09-01', '2026-09-01').days, 1);
  assertEquals(validateDateRange('2026-08-01', '2026-10-01').days, 62);
  assertCode(() => validateDateRange('2026-08-01', '2026-10-02'), 'range_too_long');
  assertCode(() => validateDateRange('2026-09-02', '2026-09-01'), 'invalid_range');
  assertCode(() => validateDateRange('2026-02-30', '2026-03-01'), 'invalid_date');
  assertCode(() => validateDateRange(undefined, '2026-03-01'), 'invalid_date');
});

// ---- Correction -----------------------------------------------------------

const NOW = T('2026-09-29T20:00:00Z');
const OPEN = { id: 'a', clock_in: '2026-09-28T14:00:00Z', clock_out: null };

Deno.test('correction requires a note', () => {
  assertCode(() => normalizeNote('   '), 'note_required');
  assertCode(() => buildCorrection(OPEN, { clock_out: '2026-09-28T22:00:00Z', note: '' }, 'a@x.com', NOW), 'note_required');
});

Deno.test('correction: first one keeps the originals, later ones do not', () => {
  const first = buildCorrection(OPEN, { clock_out: '2026-09-28T22:00:00Z', note: 'Olvidó checar salida' }, 'admin@x.com', NOW);
  assertEquals(first.clock_out, '2026-09-28T22:00:00.000Z');
  assertEquals(first.clock_in, '2026-09-28T14:00:00.000Z');
  assertEquals(first.original_clock_in, '2026-09-28T14:00:00Z');
  assertEquals(first.original_clock_out, null);
  assertEquals(first.edited_by, 'admin@x.com');
  assertEquals(first.edit_note, 'Olvidó checar salida');

  const already = { ...OPEN, clock_out: '2026-09-28T22:00:00.000Z', edited_at: '2026-09-29T10:00:00Z', original_clock_in: 'x' };
  const second = buildCorrection(already, { clock_out: '2026-09-28T23:00:00Z', note: 'Ajuste' }, 'admin@x.com', NOW);
  assertEquals('original_clock_in' in second, false);
});

Deno.test('correction: out before in, future dates, no changes, garbage', () => {
  assertCode(() => buildCorrection(OPEN, { clock_out: '2026-09-28T13:00:00Z', note: 'x' }, 'a', NOW), 'out_before_in');
  assertCode(() => buildCorrection(OPEN, { clock_out: '2026-09-30T13:00:00Z', note: 'x' }, 'a', NOW), 'future_date');
  assertCode(() => buildCorrection(OPEN, { clock_in: '2026-09-30T13:00:00Z', note: 'x' }, 'a', NOW), 'future_date');
  assertCode(() => buildCorrection(OPEN, { note: 'x' }, 'a', NOW), 'nothing_to_correct');
  assertCode(() => buildCorrection(OPEN, { clock_in: '2026-09-28T14:00:00Z', note: 'x' }, 'a', NOW), 'nothing_to_correct');
  assertCode(() => buildCorrection(OPEN, { clock_out: 'nope', note: 'x' }, 'a', NOW), 'invalid_clock_out');
  assertCode(() => buildCorrection(OPEN, { clock_out: null, note: 'x' }, 'a', NOW), 'invalid_clock_out');
});

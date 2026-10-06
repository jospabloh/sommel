// Terminal mode, phase 2a: the pass, who may unlock a terminal, the roster,
// and what the bar sees. Zero external imports.
import {
  PASS_TTL_MS,
  personMayUseTerminal,
  randomHex,
  resolvePermission,
  routeAllowsLockedTerminal,
  signPass,
  terminalAllows,
  verifyPass,
  passEpochOf,
  LOCKED_TERMINAL_PERMISSIONS,
} from '../../scripts/templates/_guard_logic.ts';
import {
  FORGOTTEN_HOURS,
  LOCK_MINUTES,
  MAX_FAILED_ATTEMPTS,
  accessTokenFromLocation,
  buildRoster,
  normalizeAllowed,
  publicDevice,
  registerFailure,
  validateTerminalName,
  registerDeviceFailure,
  DEVICE_MAX_FAILED_UNLOCKS,
} from '../functions/terminals/_terminal_logic.ts';
import * as attendance from '../functions/attendance/handlers/_logic.ts';
import * as attendancePin from '../functions/attendance/handlers/_pin.ts';
import * as terminalPin from '../functions/terminals/_pin.ts';

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg ?? 'assertEquals'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function assertThrows(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (e) {
    if ((e as { code?: string }).code === code) return;
    throw new Error(`expected ${code}, got ${(e as Error).message}`);
  }
  throw new Error(`expected ${code}, nothing thrown`);
}

const NOW = Date.parse('2026-10-06T20:00:00Z');
const KEY = 'a'.repeat(64);
const OTHER_KEY = 'b'.repeat(64);

Deno.test('a pass signed for a person on this device verifies, and names that person', async () => {
  const pass = await signPass(KEY, 'dev1', 'u1', NOW + PASS_TTL_MS, 3);
  assertEquals(await verifyPass(KEY, 'dev1', pass, NOW, 3), { userId: 'u1', expMs: NOW + PASS_TTL_MS });
});

Deno.test('a pass is refused when expired, from another device, or signed with another key', async () => {
  const pass = await signPass(KEY, 'dev1', 'u1', NOW + 1000, 3);
  assertEquals(await verifyPass(KEY, 'dev1', pass, NOW + 1000, 3), null, 'expired at exp');
  assertEquals(await verifyPass(KEY, 'dev2', pass, NOW, 3), null, 'other device');
  assertEquals(await verifyPass(OTHER_KEY, 'dev1', pass, NOW, 3), null, 'other key');
});

Deno.test('after the next unlock or a lock, the previous pass stops working', async () => {
  const pass = await signPass(KEY, 'dev1', 'u1', NOW + PASS_TTL_MS, 3);
  assertEquals(await verifyPass(KEY, 'dev1', pass, NOW, 4), null);
  assertEquals(passEpochOf({ pass_epoch: 4 }), 4);
  assertEquals(passEpochOf({}), 0, 'rows from before the epoch existed');
});

Deno.test('a locked terminal may only run its print station', () => {
  assertEquals([...LOCKED_TERMINAL_PERMISSIONS], ['Impresion:operar']);
});

Deno.test('ten misses across people lock the terminal itself', () => {
  let n = 0;
  for (let i = 1; i < DEVICE_MAX_FAILED_UNLOCKS; i++) {
    const r = registerDeviceFailure(n, NOW);
    assertEquals(r.unlock_locked_until, null, `miss ${i}`);
    n = r.failed_unlocks;
  }
  const last = registerDeviceFailure(n, NOW);
  assertEquals([last.failed_unlocks, typeof last.unlock_locked_until], [0, 'string']);
});

Deno.test('a pass whose person was swapped without re-signing is refused', async () => {
  const pass = await signPass(KEY, 'dev1', 'staff1', NOW + PASS_TTL_MS, 3);
  const [, sig] = pass.split('.');
  const forgedPayload = btoa(JSON.stringify({ d: 'dev1', u: 'admin1', e: NOW + PASS_TTL_MS, n: 3 })).replace(/=+$/, '');
  assertEquals(await verifyPass(KEY, 'dev1', `${forgedPayload}.${sig}`, NOW, 3), null);
});

Deno.test('garbage, a missing key and a malformed key never verify and never throw', async () => {
  for (const p of [null, '', 'x', 'a.b', 'notbase64!.00', 42]) {
    assertEquals(await verifyPass(KEY, 'dev1', p, NOW, 3), null, String(p));
  }
  const pass = await signPass(KEY, 'dev1', 'u1', NOW + PASS_TTL_MS, 3);
  assertEquals(await verifyPass(undefined, 'dev1', pass, NOW, 3), null);
  assertEquals(await verifyPass('short', 'dev1', pass, NOW, 3), null);
});

Deno.test('every terminal gets its own random key', () => {
  const a = randomHex(32), b = randomHex(32);
  assertEquals(a.length, 64);
  assertEquals(a === b, false);
});

Deno.test('a terminal account alone has no permission at all', () => {
  assertEquals(resolvePermission('Comandas:tomar', { isPlatform: false, appRole: 'terminal' as never }), false);
  assertEquals(resolvePermission('Mesas:ver', { isPlatform: false, appRole: null }), false);
});

Deno.test('only someone of the same bar, with a bar role and on the list, may use a terminal', () => {
  const device = { tenant_id: 'bar1', allowed: { mode: 'people', user_ids: ['a'] } };
  assertEquals(personMayUseTerminal({ id: 'a', tenant_id: 'bar1', app_role: 'staff' }, device), true);
  assertEquals(personMayUseTerminal({ id: 'b', tenant_id: 'bar1', app_role: 'staff' }, device), false, 'not on list');
  assertEquals(personMayUseTerminal({ id: 'a', tenant_id: 'bar2', app_role: 'staff' }, device), false, 'other bar');
  assertEquals(personMayUseTerminal({ id: 'a', tenant_id: 'bar1', app_role: 'terminal' }, device), false, 'a terminal');
  assertEquals(personMayUseTerminal({ id: 'a', tenant_id: 'bar1', app_role: 'super_admin' }, device), false, 'not a bar role');
  assertEquals(terminalAllows({ mode: 'all' }, 'anyone'), true);
  assertEquals(terminalAllows(undefined, 'anyone'), true);
});

Deno.test('the locked-terminal mark is opt-in per route', () => {
  const plain = () => Promise.resolve({});
  const marked = Object.assign(() => Promise.resolve({}), { allowLockedTerminal: true });
  assertEquals(routeAllowsLockedTerminal(plain), false);
  assertEquals(routeAllowsLockedTerminal(marked), true);
});

Deno.test('"¿Quién eres?" features who is on shift and the admins, and hides who cannot unlock', () => {
  const users = [
    { id: 'z', full_name: 'Zoe', app_role: 'staff', tenant_id: 'bar1' },
    { id: 'a', full_name: 'Ana', app_role: 'staff', tenant_id: 'bar1' },
    { id: 'boss', full_name: 'Alby', app_role: 'bar_admin', tenant_id: 'bar1' },
    { id: 'nopin', full_name: 'Sin PIN', app_role: 'staff', tenant_id: 'bar1' },
    { id: 't', full_name: 'Terminal Caja', app_role: 'terminal', tenant_id: 'bar1' },
    { id: 'x', full_name: 'Otro bar', app_role: 'staff', tenant_id: 'bar2' },
  ];
  const roster = buildRoster(users, {
    tenantId: 'bar1',
    allows: () => true,
    withPin: new Set(['z', 'a', 'boss', 't', 'x']),
    onShift: new Set(['z']),
  });
  assertEquals(roster.map((p) => [p.id, p.featured]), [['boss', true], ['z', true], ['a', false]]);
});

Deno.test('the bar never sees the pass key nor the account email of a terminal', () => {
  const view = publicDevice({ id: 'd', name: 'Caja', pass_key: KEY, account_email: 't-1@x', account_user_id: 'u' });
  assertEquals(view.account_pending, false);
  assertEquals(publicDevice({ revoked_at: 'x' }).account_pending, true, 'revoked, account not deleted yet');
  assertEquals('pass_key' in view || 'account_email' in view || 'account_user_id' in view, false);
});

Deno.test('a terminal list of people must name at least one real member', () => {
  const members = new Set(['a', 'b']);
  assertEquals(normalizeAllowed({ mode: 'people', user_ids: ['a', 'zz', 'a'] }, members), { mode: 'people', user_ids: ['a'] });
  assertEquals(normalizeAllowed(undefined, members), { mode: 'all' });
  assertThrows(() => normalizeAllowed({ mode: 'people', user_ids: ['zz'] }, members), 'invalid_allowed');
});

Deno.test('names are 1 to 40 letters', () => {
  assertEquals(validateTerminalName('  Caja   principal '), 'Caja principal');
  assertThrows(() => validateTerminalName(''), 'invalid_name');
  assertThrows(() => validateTerminalName('x'.repeat(41)), 'invalid_name');
});

Deno.test('the session is read from the sign-in redirect', () => {
  assertEquals(accessTokenFromLocation('https://sommel.acaciaco.com.mx/?access_token=abc'), 'abc');
  assertEquals(accessTokenFromLocation('/login'), null);
});

Deno.test('a PIN locks the same way at a terminal as at the checador', () => {
  assertEquals(MAX_FAILED_ATTEMPTS, attendance.MAX_FAILED_ATTEMPTS);
  assertEquals(LOCK_MINUTES, attendance.LOCK_MINUTES);
  assertEquals(FORGOTTEN_HOURS, attendance.FORGOTTEN_HOURS);
  for (const n of [0, 3, 4]) {
    const a = registerFailure(n, NOW), b = attendance.registerFailure(n, NOW);
    assertEquals([a.failed_attempts, a.locked_until], [b.failed_attempts, b.locked_until], `after ${n}`);
  }
});

Deno.test('a PIN made at the checador opens the terminal, and the other way round', async () => {
  assertEquals(terminalPin.PIN_ITERATIONS, attendancePin.PIN_ITERATIONS);
  const fromChecador = await attendancePin.hashPin('4821');
  assertEquals(await terminalPin.verifyPin('4821', fromChecador.salt, fromChecador.pin_hash), true);
  assertEquals(await terminalPin.verifyPin('4822', fromChecador.salt, fromChecador.pin_hash), false);
  const fromTerminal = await terminalPin.hashPin('4821');
  assertEquals(await attendancePin.verifyPin('4821', fromTerminal.salt, fromTerminal.pin_hash), true);
});

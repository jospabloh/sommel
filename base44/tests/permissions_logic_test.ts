// Deno tests for base44/functions/permissions/handlers/_logic.ts (zero imports)
// and for the registry's label map.
//   deno test --allow-env base44/tests/permissions_logic_test.ts
import {
  LogicError,
  canManagePermissions,
  normalizeRole,
  profileView,
  validateOverrides,
} from '../functions/permissions/handlers/_logic.ts';
import { PERMISSION_DEFAULTS as SERVER_DEFAULTS } from '../../scripts/templates/_guard_logic.ts';
// @ts-ignore: plain JS module, same file the client imports.
import { PERMISSION_DEFAULTS, PERMISSION_LABELS, permissionLabel } from '../../src/lib/permissionRegistry.js';

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

const KEYS = Object.keys(SERVER_DEFAULTS);

Deno.test('canManagePermissions: bar_admin and platform yes, staff and no role no', () => {
  assertEquals(canManagePermissions({ isPlatform: false, appRole: 'bar_admin' }), true);
  assertEquals(canManagePermissions({ isPlatform: true, appRole: null }), true);
  assertEquals(canManagePermissions({ isPlatform: false, appRole: 'staff' }), false);
  assertEquals(canManagePermissions({ isPlatform: false, appRole: null }), false);
  assertEquals(canManagePermissions({ isPlatform: false, appRole: undefined }), false);
});

Deno.test('normalizeRole: defaults to staff, refuses bar_admin and junk', () => {
  assertEquals(normalizeRole(undefined), 'staff');
  assertEquals(normalizeRole('staff'), 'staff');
  assertCode(() => normalizeRole('bar_admin'), 'invalid_role');
  assertCode(() => normalizeRole('admin'), 'invalid_role');
  assertCode(() => normalizeRole(7), 'invalid_role');
});

Deno.test('validateOverrides: accepts real keys with booleans, returns a copy', () => {
  const input = { 'Cobro:descuento': true, 'Cobro:cobrar': false };
  const out = validateOverrides(input, KEYS);
  assertEquals(out, input);
  if (out === input) throw new Error('must return a copy');
});

Deno.test('validateOverrides: empty map is valid (clears every override)', () => {
  assertEquals(validateOverrides({}, KEYS), {});
});

Deno.test('validateOverrides: unknown key rejects the whole request', () => {
  assertCode(() => validateOverrides({ 'Cobro:cobrar': true, 'Nada:existe': true }, KEYS), 'invalid_key');
});

Deno.test('validateOverrides: non-boolean values are refused', () => {
  assertCode(() => validateOverrides({ 'Cobro:cobrar': 'true' }, KEYS), 'invalid_value');
  assertCode(() => validateOverrides({ 'Cobro:cobrar': 1 }, KEYS), 'invalid_value');
  assertCode(() => validateOverrides({ 'Cobro:cobrar': null }, KEYS), 'invalid_value');
});

Deno.test('validateOverrides: non-object bodies are refused', () => {
  assertCode(() => validateOverrides(undefined, KEYS), 'invalid_body');
  assertCode(() => validateOverrides(null, KEYS), 'invalid_body');
  assertCode(() => validateOverrides([], KEYS), 'invalid_body');
  assertCode(() => validateOverrides('x', KEYS), 'invalid_body');
});

Deno.test('validateOverrides: prototype keys are not registry keys', () => {
  assertCode(() => validateOverrides(JSON.parse('{"__proto__": true}'), KEYS), 'invalid_key');
  assertCode(() => validateOverrides({ constructor: true }, KEYS), 'invalid_key');
});

Deno.test('profileView: drops non-boolean junk stored in the row, tolerates no row', () => {
  assertEquals(profileView({ overrides: { 'Cobro:cobrar': false, x: 'y' } }, 'staff'), {
    role: 'staff',
    overrides: { 'Cobro:cobrar': false },
  });
  assertEquals(profileView(null, 'staff'), { role: 'staff', overrides: {} });
  assertEquals(profileView({ overrides: [] }, 'staff'), { role: 'staff', overrides: {} });
});

Deno.test('registry: every key has a section and a Spanish label, and no label is orphaned', () => {
  const keys = Object.keys(PERMISSION_DEFAULTS).sort();
  const labelled = Object.keys(PERMISSION_LABELS).sort();
  assertEquals(labelled, keys);
  for (const k of keys) {
    const l = (PERMISSION_LABELS as Record<string, { section: string; label: string }>)[k];
    if (!l.section || !l.label) throw new Error(`label incompleto: ${k}`);
    if (l.label.includes('—') || l.label.includes('–')) throw new Error(`guion largo en ${k}`);
  }
  assertEquals(permissionLabel('Cobro:cobrar'), (PERMISSION_LABELS as Record<string, { label: string }>)['Cobro:cobrar'].label);
  assertEquals(permissionLabel('Nada:existe'), 'Nada:existe');
});

Deno.test('registry and generated server copy list the same keys and defaults', () => {
  assertEquals(SERVER_DEFAULTS, PERMISSION_DEFAULTS);
});

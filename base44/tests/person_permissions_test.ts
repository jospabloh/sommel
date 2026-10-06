// Phase 3 (2026-10-06): permissions per person and the cocina / barra split.
// Each test names what would break for a real bar if the rule drifted.
import {
  LEGACY_PERMISSION_ALIASES as SERVER_ALIASES,
  PERMISSION_DEFAULTS as SERVER_DEFAULTS,
  personOverridesOf,
  resolvePermission as serverResolve,
} from '../../scripts/templates/_guard_logic.ts';
// @ts-ignore: plain JS module, the same file the client imports.
import { LEGACY_PERMISSION_ALIASES as CLIENT_ALIASES, PERMISSION_DEFAULTS as CLIENT_DEFAULTS, resolvePermission as clientResolve, upgradeLegacyKeys } from '../../src/lib/permissionRegistry.js';
// @ts-ignore: plain JS module.
import { cleanOverrides, cleanPersonOverrides, personChoice, withPersonChoice } from '../../src/components/permissions/permissionsLogic.js';
// @ts-ignore: plain JS module.
import { STATION_PERMISSION as CLIENT_STATION_PERMISSION } from '../../src/components/stations/stationHelpers.js';
import { STATION_PERMISSION, permissionsForItems } from '../functions/stations/handlers/_logic.ts';
import { personTargetProblem } from '../functions/permissions/handlers/_logic.ts';

// Key order of a map does not matter here.
const canon = (v: unknown): string =>
  JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x));
function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  if (canon(actual) !== canon(expected)) {
    throw new Error(`${msg ?? 'assertEquals'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const staff = (overrides: Record<string, boolean> | null, personOverrides: Record<string, boolean> | null = null) => ({
  isPlatform: false,
  appRole: 'staff' as const,
  overrides,
  personOverrides,
});

Deno.test('a person override beats the role profile, both ways (client and server agree)', () => {
  for (const resolve of [serverResolve, clientResolve]) {
    // The team may work the kitchen, but not Ana.
    assertEquals(resolve('Estaciones:cocina', staff({ 'Estaciones:cocina': true }, { 'Estaciones:cocina': false })), false);
    // The team may not, but this cook may.
    assertEquals(resolve('Estaciones:cocina', staff({ 'Estaciones:cocina': false }, { 'Estaciones:cocina': true })), true);
    // No person choice: the role profile decides, then the default.
    assertEquals(resolve('Estaciones:cocina', staff({ 'Estaciones:cocina': false }, {})), false);
    assertEquals(resolve('Estaciones:cocina', staff(null, null)), true);
  }
});

Deno.test('a bar admin is never restricted by a person override (they can always undo it)', () => {
  const ctx = { isPlatform: false, appRole: 'bar_admin' as const, overrides: null, personOverrides: { 'Estaciones:cocina': false } };
  assertEquals(serverResolve('Estaciones:cocina', ctx), true);
  assertEquals(clientResolve('Estaciones:cocina', ctx), true);
});

Deno.test('a bar that had denied the old Estaciones:operar keeps it denied for cocina AND barra', () => {
  for (const resolve of [serverResolve, clientResolve]) {
    assertEquals(resolve('Estaciones:cocina', staff({ 'Estaciones:operar': false })), false, 'profile, cocina');
    assertEquals(resolve('Estaciones:barra', staff({ 'Estaciones:operar': false })), false, 'profile, barra');
    // A new key, once saved, wins over the old one.
    assertEquals(resolve('Estaciones:barra', staff({ 'Estaciones:operar': false, 'Estaciones:barra': true })), true);
  }
});

Deno.test('the Permisos screen does not silently drop an old Estaciones:operar=false on its next save', () => {
  assertEquals(cleanOverrides({ 'Estaciones:operar': false }), { 'Estaciones:barra': false, 'Estaciones:cocina': false });
  assertEquals(cleanPersonOverrides({ 'Estaciones:operar': false }), { 'Estaciones:barra': false, 'Estaciones:cocina': false });
  assertEquals(upgradeLegacyKeys({ 'Estaciones:operar': true, 'Estaciones:barra': false }), { 'Estaciones:barra': false, 'Estaciones:cocina': true });
});

Deno.test('client and server share the split: same defaults, same aliases, same station keys', () => {
  assertEquals(Object.keys(CLIENT_DEFAULTS).sort(), Object.keys(SERVER_DEFAULTS).sort());
  assertEquals(CLIENT_ALIASES, SERVER_ALIASES);
  assertEquals(CLIENT_STATION_PERMISSION, STATION_PERMISSION);
  for (const key of Object.values(STATION_PERMISSION)) {
    if (!SERVER_DEFAULTS[key]) throw new Error(`${key} missing from the registry`);
  }
  if (SERVER_DEFAULTS['Estaciones:operar']) throw new Error('Estaciones:operar should be retired');
});

Deno.test('each line is checked against ITS station: a kitchen-only cook cannot mark a drink ready', () => {
  assertEquals(permissionsForItems([{ station: 'kitchen' }, { station: 'kitchen' }]), { keys: ['Estaciones:cocina'], needsAny: false });
  assertEquals(permissionsForItems([{ station: 'kitchen' }, { station: 'bar' }]), { keys: ['Estaciones:barra', 'Estaciones:cocina'], needsAny: false });
  // A line without a station still needs one of the two keys, never none.
  assertEquals(permissionsForItems([{ station: null }]), { keys: [], needsAny: true });
});

Deno.test('per-person choices: an explicit Sí survives the role later turning the key off', () => {
  let m = withPersonChoice({}, 'Estaciones:barra', 'yes');
  assertEquals(m, { 'Estaciones:barra': true });
  assertEquals(personChoice('Estaciones:barra', m), 'yes');
  m = withPersonChoice(m, 'Estaciones:cocina', 'no');
  assertEquals(personChoice('Estaciones:cocina', m), 'no');
  m = withPersonChoice(m, 'Estaciones:barra', 'role');
  assertEquals(m, { 'Estaciones:cocina': false });
  assertEquals(cleanPersonOverrides({ 'No:existe': true, 'Estaciones:barra': 'sí' }), {});
});

Deno.test('only a staff member of your own bar can get personal permissions; others look missing', () => {
  assertEquals(personTargetProblem({ tenant_id: 'bar', app_role: 'staff' }, 'bar'), null);
  assertEquals(personTargetProblem({ tenant_id: 'otro', app_role: 'staff' }, 'bar')?.status, 404);
  assertEquals(personTargetProblem({ tenant_id: 'bar', app_role: 'terminal' }, 'bar')?.status, 404);
  assertEquals(personTargetProblem(null, 'bar')?.status, 404);
  assertEquals(personTargetProblem({ tenant_id: 'bar', app_role: 'bar_admin' }, 'bar')?.code, 'invalid_role');
});

Deno.test('a malformed permission_overrides on the User row is ignored, not trusted', () => {
  assertEquals(personOverridesOf({ permission_overrides: ['x'] }), null);
  assertEquals(personOverridesOf({ permission_overrides: 'all' }), null);
  assertEquals(personOverridesOf(null), null);
  assertEquals(personOverridesOf({ permission_overrides: { a: true } }), { a: true });
});

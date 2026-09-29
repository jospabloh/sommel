// Deno tests for the Permisos screen rules
// (src/components/permissions/permissionsLogic.js). Zero external imports.
//   deno test --allow-env base44/tests/permissions_ui_logic_test.ts
// @ts-ignore: plain JS modules, same files the client imports.
import * as L from '../../src/components/permissions/permissionsLogic.js';
// @ts-ignore: plain JS module.
import { PERMISSION_DEFAULTS } from '../../src/lib/permissionRegistry.js';

function eq(actual: unknown, expected: unknown, msg?: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(msg || `expected ${e}, got ${a}`);
}

Deno.test('every registry key appears exactly once across sections', () => {
  const keys = L.groupSections().flatMap((s: any) => s.items.map((i: any) => i.key));
  const shown = Object.keys(PERMISSION_DEFAULTS).filter((k) => !L.NOT_ENFORCED_KEYS.includes(k));
  eq(keys.slice().sort(), shown.slice().sort());
  // Keys nothing enforces are never offered as switches.
  eq(keys.some((k: string) => L.NOT_ENFORCED_KEYS.includes(k)), false);
});

Deno.test('effective value falls back to the staff default', () => {
  eq(L.effectiveFor('Menú:ver', {}), true);
  eq(L.effectiveFor('Menú:editar', {}), false);
  eq(L.effectiveFor('Menú:editar', { 'Menú:editar': true }), true);
  eq(L.effectiveFor('Menú:ver', { 'Menú:ver': false }), false);
});

Deno.test('changed only when the override differs from the default', () => {
  eq(L.isChanged('Menú:editar', { 'Menú:editar': true }), true);
  eq(L.isChanged('Menú:editar', { 'Menú:editar': false }), false);
  eq(L.isChanged('Menú:editar', {}), false);
});

Deno.test('setting a value equal to the default drops the entry', () => {
  eq(L.withValue({ 'Menú:editar': true }, 'Menú:editar', false), {});
  eq(L.withValue({}, 'Menú:editar', true), { 'Menú:editar': true });
});

Deno.test('reset removes only that key and keeps the rest', () => {
  const m = { 'Menú:editar': true, 'Menú:ver': false };
  eq(L.withoutKey(m, 'Menú:editar'), { 'Menú:ver': false });
});

Deno.test('cleanOverrides drops unknown keys, non-booleans and default-equal entries', () => {
  eq(
    L.cleanOverrides({ 'Nope:x': true, 'Menú:editar': 'si', 'Menú:ver': true, 'Cobro:descuento': true }),
    { 'Cobro:descuento': true }
  );
  eq(L.changedCount({ 'Cobro:descuento': true, 'Menú:ver': false }), 2);
});

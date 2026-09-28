// Deno tests for scripts/templates/_guard_logic.ts — zero external imports,
// so this runs even with deno.land/jsr.io blocked (same reasoning as
// StockFlow's machinery_sales_fields_test.ts).
//
//   /path/to/deno test --allow-env base44/tests/guard_logic_test.ts

import {
  resolvePermission,
  isBlockedBillingStatus,
  rowBelongsToTenant,
  isValidCents,
  sumCents,
  lineTotalCents,
  pesosToCents,
  centsToPesos,
  HttpError,
  PERMISSION_DEFAULTS,
} from '../../scripts/templates/_guard_logic.ts';

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(msg || `expected ${e}, got ${a}`);
  }
}

function assertThrows(fn: () => unknown, msg?: string) {
  try {
    fn();
  } catch {
    return;
  }
  throw new Error(msg || 'expected function to throw');
}

// ---- resolvePermission: precedence ----

Deno.test('resolvePermission: platform is always allowed, even for an unknown key', () => {
  assertEquals(resolvePermission('Nada:existe', { isPlatform: true, appRole: null }), true);
});

Deno.test('resolvePermission: bar_admin is always allowed', () => {
  assertEquals(resolvePermission('Menú:editar', { isPlatform: false, appRole: 'bar_admin' }), true);
  assertEquals(resolvePermission('Comandas:cancelar_orden', { isPlatform: false, appRole: 'bar_admin' }), true);
});

Deno.test('resolvePermission: staff gets the registry default when there is no override', () => {
  assertEquals(resolvePermission('Menú:ver', { isPlatform: false, appRole: 'staff' }), true);
  assertEquals(resolvePermission('Menú:editar', { isPlatform: false, appRole: 'staff' }), false);
  assertEquals(resolvePermission('Comandas:tomar', { isPlatform: false, appRole: 'staff' }), true);
  assertEquals(resolvePermission('Comandas:cancelar_orden', { isPlatform: false, appRole: 'staff' }), false);
});

Deno.test('resolvePermission: an explicit override wins over the default for staff', () => {
  assertEquals(
    resolvePermission('Menú:editar', { isPlatform: false, appRole: 'staff', overrides: { 'Menú:editar': true } }),
    true
  );
  assertEquals(
    resolvePermission('Comandas:tomar', { isPlatform: false, appRole: 'staff', overrides: { 'Comandas:tomar': false } }),
    false
  );
});

Deno.test('resolvePermission: an override never downgrades bar_admin/platform (checked first)', () => {
  assertEquals(
    resolvePermission('Menú:editar', { isPlatform: false, appRole: 'bar_admin', overrides: { 'Menú:editar': false } }),
    true
  );
});

Deno.test('resolvePermission: unknown key denies for staff', () => {
  assertEquals(resolvePermission('Sección:inventada', { isPlatform: false, appRole: 'staff' }), false);
});

Deno.test('resolvePermission: no app_role at all denies (not platform, not bar_admin, not staff)', () => {
  assertEquals(resolvePermission('Menú:ver', { isPlatform: false, appRole: null }), false);
});

Deno.test('PERMISSION_DEFAULTS: every row from the contract has bar_admin=true (§3 table)', () => {
  for (const [key, v] of Object.entries(PERMISSION_DEFAULTS)) {
    if (!v.bar_admin) throw new Error(`${key} should default bar_admin to true per contract §3`);
  }
});

// ---- rowBelongsToTenant: loadOwned's ownership check, pinned flat (fixed
// 2026-09-28 — used to read row.data?.tenant_id, always undefined on a real
// flat row, which made loadOwned 404 on every id for every non-platform
// caller, including their own bar's own rows). ----

Deno.test('rowBelongsToTenant: a flat row with a matching tenant_id belongs to the caller', () => {
  const row = { id: 'prod1', tenant_id: 'bar_a', name: 'Malbec' };
  assertEquals(rowBelongsToTenant(row, 'bar_a', false), true);
});

Deno.test('rowBelongsToTenant: a flat row with a DIFFERENT tenant_id does not belong (cross-tenant read blocked)', () => {
  const row = { id: 'prod1', tenant_id: 'bar_b', name: 'Malbec' };
  assertEquals(rowBelongsToTenant(row, 'bar_a', false), false);
});

Deno.test('rowBelongsToTenant: reading a nested {data:{tenant_id}} shape (the bug) always fails to match — this is why the fix reads tenant_id flat', () => {
  // A row shaped the OLD (wrong) way `{ id, data: { tenant_id } }` has no
  // top-level `tenant_id` at all, so a handler that regressed to
  // `row.data.tenant_id` would see `undefined` here — this fixture proves
  // rowBelongsToTenant, reading the flat field, still correctly denies a
  // genuinely different tenant AND still correctly allows a genuine match
  // once the row is (as it always is in production) actually flat.
  const wronglyNestedRow: any = { id: 'prod1', data: { tenant_id: 'bar_a' } };
  assertEquals(
    rowBelongsToTenant(wronglyNestedRow, 'bar_a', false),
    false,
    'a row with no flat tenant_id must never be treated as belonging to the caller'
  );
  const flatRow = { id: 'prod1', tenant_id: 'bar_a' };
  assertEquals(rowBelongsToTenant(flatRow, 'bar_a', false), true);
});

Deno.test('rowBelongsToTenant: platform bypasses the tenant check entirely, even for a null/foreign row', () => {
  assertEquals(rowBelongsToTenant(null, 'bar_a', true), true);
  assertEquals(rowBelongsToTenant({ id: 'x', tenant_id: 'bar_b' }, 'bar_a', true), true);
});

Deno.test('rowBelongsToTenant: a missing row never belongs, for a non-platform caller', () => {
  assertEquals(rowBelongsToTenant(null, 'bar_a', false), false);
  assertEquals(rowBelongsToTenant(undefined, 'bar_a', false), false);
});

// ---- billing gate ----

Deno.test('isBlockedBillingStatus: blocks view_only and suspended, nothing else', () => {
  assertEquals(isBlockedBillingStatus('view_only'), true);
  assertEquals(isBlockedBillingStatus('suspended'), true);
  assertEquals(isBlockedBillingStatus('active'), false);
  assertEquals(isBlockedBillingStatus('trial'), false);
  assertEquals(isBlockedBillingStatus(null), false);
  assertEquals(isBlockedBillingStatus(undefined), false);
});

// ---- money helpers ----

Deno.test('isValidCents: only non-negative integers pass', () => {
  assertEquals(isValidCents(0), true);
  assertEquals(isValidCents(12550), true);
  assertEquals(isValidCents(-5), false);
  assertEquals(isValidCents(1.5), false);
  assertEquals(isValidCents('100'), false);
  assertEquals(isValidCents(NaN), false);
});

Deno.test('sumCents: adds valid integer amounts', () => {
  assertEquals(sumCents([100, 200, 300]), 600);
  assertEquals(sumCents([]), 0);
});

Deno.test('sumCents: throws HttpError on an invalid amount', () => {
  assertThrows(() => sumCents([100, -5]));
  try {
    sumCents([1.5]);
  } catch (e) {
    if (!(e instanceof HttpError)) throw new Error('expected HttpError');
    assertEquals(e.status, 400);
    assertEquals(e.code, 'invalid_amount');
  }
});

Deno.test('lineTotalCents: unit_price * qty, rounded', () => {
  assertEquals(lineTotalCents(1000, 2), 2000);
  assertEquals(lineTotalCents(9000, 0.5), 4500); // e.g. tisana a granel, medio de 100 g
  assertEquals(lineTotalCents(333, 3), 999);
});

Deno.test('lineTotalCents: throws on invalid qty or price', () => {
  assertThrows(() => lineTotalCents(1000, 0));
  assertThrows(() => lineTotalCents(1000, -1));
  assertThrows(() => lineTotalCents(-1, 1));
});

Deno.test('pesosToCents / centsToPesos round-trip', () => {
  assertEquals(pesosToCents(125.5), 12550);
  assertEquals(centsToPesos(12550), 125.5);
});

// ---- HttpError shape ----

Deno.test('HttpError carries status/code/message', () => {
  const err = new HttpError(403, 'forbidden', 'No tienes permiso para esta acción');
  assertEquals(err.status, 403);
  assertEquals(err.code, 'forbidden');
  assertEquals(err.message, 'No tienes permiso para esta acción');
});

Deno.test('HttpError: optional extra carries structured fields (e.g. order_id on table_busy)', () => {
  const err = new HttpError(409, 'table_busy', 'Esa mesa ya tiene una comanda abierta', { order_id: 'ord_123' });
  assertEquals(err.extra, { order_id: 'ord_123' });
});

Deno.test('HttpError: extra is undefined when omitted', () => {
  const err = new HttpError(404, 'not_found', 'No encontrado');
  assertEquals(err.extra, undefined);
});

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
  redactItemCost,
  redactItemCosts,
  HttpError,
  PERMISSION_DEFAULTS,
  BAR_UTC_OFFSET_MIN,
  DEFAULT_PAYMENT_METHODS,
  computeOrderTotals,
  activePaymentsTotal,
  pickSurvivor,
  padLine,
  localDayRange,
  localDateString,
  localHour,
  splitEqual,
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

// ---- D7 cost redaction (redactItemCost/redactItemCosts) ----

Deno.test('redactItemCost: strips unit_cost when the caller cannot see costs', () => {
  const row = { id: 'i1', name: 'Malbec', unit_price: 1200, unit_cost: 600 };
  const result = redactItemCost(row, false);
  assertEquals(Object.prototype.hasOwnProperty.call(result, 'unit_cost'), false);
  assertEquals(result, { id: 'i1', name: 'Malbec', unit_price: 1200 });
});

Deno.test('redactItemCost: leaves the row untouched (same fields) when the caller can see costs', () => {
  const row = { id: 'i1', name: 'Malbec', unit_price: 1200, unit_cost: 600 };
  const result = redactItemCost(row, true);
  assertEquals(result, row);
});

Deno.test('redactItemCost: a row with no unit_cost field at all is unaffected either way', () => {
  const row = { id: 'i1', name: 'Malbec', unit_price: 1200 };
  assertEquals(redactItemCost(row, false), row);
  assertEquals(redactItemCost(row, true), row);
});

Deno.test('redactItemCost: null/undefined row passes through instead of throwing', () => {
  assertEquals(redactItemCost(null as any, false), null);
  assertEquals(redactItemCost(undefined as any, false), undefined);
});

Deno.test('redactItemCosts: strips unit_cost from every row in an array when denied', () => {
  const rows = [
    { id: 'i1', unit_price: 1000, unit_cost: 400 },
    { id: 'i2', unit_price: 2000, unit_cost: 900 },
  ];
  const result = redactItemCosts(rows, false);
  assertEquals(result, [
    { id: 'i1', unit_price: 1000 },
    { id: 'i2', unit_price: 2000 },
  ]);
});

Deno.test('redactItemCosts: returns the SAME array reference when the caller can see costs (no copy needed)', () => {
  const rows = [{ id: 'i1', unit_price: 1000, unit_cost: 400 }];
  const result = redactItemCosts(rows, true);
  if (result !== rows) throw new Error('expected the exact same array reference back');
});

Deno.test('redactItemCosts: an empty array stays empty either way', () => {
  assertEquals(redactItemCosts([], false), []);
  assertEquals(redactItemCosts([], true), []);
});

// ---- Entrega 2 shared logic ----

const LINES = [
  { status: 'enviado', unit_price: 56000, qty: 2 }, // 112000
  { status: 'nuevo', unit_price: 9000, qty: 1 }, // 9000
  { status: 'cancelado', unit_price: 99999, qty: 9 }, // excluded
];

Deno.test('computeOrderTotals: no options -> total = subtotal', () => {
  assertEquals(computeOrderTotals(LINES), { subtotal: 121000, discount: 0, tip: 0, total: 121000 });
});

Deno.test('computeOrderTotals: cortesia discounts the whole subtotal', () => {
  const t = computeOrderTotals(LINES, { discount_kind: 'cortesia', discount: 5 });
  assertEquals(t, { subtotal: 121000, discount: 121000, tip: 0, total: 0 });
});

Deno.test('computeOrderTotals: discount_pct rounds; fixed discount is capped at subtotal', () => {
  assertEquals(computeOrderTotals(LINES, { discount_kind: 'descuento', discount_pct: 10 }).discount, 12100);
  assertEquals(computeOrderTotals([{ status: 'nuevo', unit_price: 333, qty: 1 }], { discount_pct: 50 }).discount, 167);
  assertEquals(computeOrderTotals(LINES, { discount: 999999 }).discount, 121000);
  assertEquals(computeOrderTotals(LINES, { discount: 5000 }).total, 116000);
});

Deno.test('computeOrderTotals: discount_pct wins over fixed discount', () => {
  assertEquals(computeOrderTotals(LINES, { discount_pct: 10, discount: 1 }).discount, 12100);
});

Deno.test('computeOrderTotals: tip_pct applies to subtotal minus discount', () => {
  const t = computeOrderTotals(LINES, { discount_pct: 10, tip_pct: 10 });
  assertEquals(t, { subtotal: 121000, discount: 12100, tip: 10890, total: 119790 });
});

Deno.test('computeOrderTotals: fixed tip and null pct fall back to amount', () => {
  const t = computeOrderTotals(LINES, { tip: 2000, tip_pct: null, discount_pct: null });
  assertEquals(t, { subtotal: 121000, discount: 0, tip: 2000, total: 123000 });
});

Deno.test('computeOrderTotals: cancelling lines shrinks a pct discount with the subtotal', () => {
  const t = computeOrderTotals([{ status: 'nuevo', unit_price: 1000, qty: 1 }], { discount_pct: 10, tip: 50 });
  assertEquals(t, { subtotal: 1000, discount: 100, tip: 50, total: 950 });
});

Deno.test('activePaymentsTotal: ignores voided payments', () => {
  assertEquals(
    activePaymentsTotal([{ amount: 500 }, { amount: 300, voided_at: '2026-09-28T00:00:00Z' }, { amount: 200, voided_at: null }]),
    700
  );
});

Deno.test('pickSurvivor: oldest created_date wins, id breaks ties, empty -> null', () => {
  assertEquals(pickSurvivor([]), null);
  const rows = [
    { id: 'b', created_date: '2026-09-28T10:00:00.000Z' },
    { id: 'c', created_date: '2026-09-28T09:00:00.000Z' },
    { id: 'a', created_date: '2026-09-28T09:00:00.000Z' },
  ];
  assertEquals(pickSurvivor(rows)?.id, 'a');
  assertEquals(pickSurvivor([...rows].reverse())?.id, 'a'); // order independent
});

Deno.test('padLine: exactly 32 columns, truncates left, keeps a space', () => {
  const l = padLine('2 x Tabla chica', '$560.00');
  assertEquals(l.length, 32);
  assertEquals(l.endsWith('$560.00'), true);
  const long = padLine('Tabla de quesos y carnes frias de la casa', '$1,120.00');
  assertEquals(long.length, 32);
  assertEquals(long.slice(-10), ' $1,120.00');
  assertEquals(padLine('a', 'b', 10), 'a        b');
});

Deno.test('BAR_UTC_OFFSET_MIN and localDayRange: local day is 06:00Z to next 06:00Z', () => {
  assertEquals(BAR_UTC_OFFSET_MIN, -360);
  assertEquals(localDayRange('2026-09-28'), {
    fromISO: '2026-09-28T06:00:00.000Z',
    toISO: '2026-09-29T06:00:00.000Z',
  });
  assertThrows(() => localDayRange('2026-02-30'));
  assertThrows(() => localDayRange('hoy'));
});

Deno.test('localHour / localDateString: shifts by UTC-6', () => {
  assertEquals(localHour('2026-09-28T06:00:00Z'), 0);
  assertEquals(localHour('2026-09-28T05:59:59Z'), 23);
  assertEquals(localHour('2026-09-28T20:30:00Z'), 14);
  assertEquals(localDateString('2026-09-29T03:00:00Z'), '2026-09-28');
  assertEquals(localDateString('2026-09-29T06:00:00Z'), '2026-09-29');
});

Deno.test('splitEqual: leftover centavos go to the first parts', () => {
  assertEquals(splitEqual(10000, 3), [3334, 3333, 3333]);
  assertEquals(splitEqual(10, 4), [3, 3, 2, 2]);
  assertEquals(splitEqual(0, 2), [0, 0]);
  assertEquals(splitEqual(1000, 1), [1000]);
  assertEquals(splitEqual(12345, 5).reduce((a, b) => a + b, 0), 12345);
  assertThrows(() => splitEqual(100, 0));
  assertThrows(() => splitEqual(100.5, 2));
});

Deno.test('DEFAULT_PAYMENT_METHODS: efectivo is_cash, all active', () => {
  assertEquals(DEFAULT_PAYMENT_METHODS.map((m) => m.key), ['efectivo', 'tarjeta', 'transferencia']);
  assertEquals(DEFAULT_PAYMENT_METHODS.filter((m) => m.is_cash).map((m) => m.key), ['efectivo']);
  assertEquals(DEFAULT_PAYMENT_METHODS.every((m) => m.active), true);
});

Deno.test('PERMISSION_DEFAULTS: entrega 2 keys and defaults', () => {
  const admin = ['Cobro:descuento', 'Cobro:anular_pago', 'Turno:ver_corte', 'Inventario:editar', 'Reportes:ver', 'Ajustes:editar'];
  const both = ['Cobro:cobrar', 'Turno:operar', 'Inventario:ver', 'Inventario:merma', 'Impresion:operar'];
  for (const k of admin) assertEquals(PERMISSION_DEFAULTS[k], { bar_admin: true, staff: false }, k);
  for (const k of both) assertEquals(PERMISSION_DEFAULTS[k], { bar_admin: true, staff: true }, k);
});

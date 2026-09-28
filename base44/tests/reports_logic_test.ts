// Deno tests for base44/functions/reports/handlers/_logic.ts (zero external
// imports in the file under test; the only other import is the shared pure
// helper, so this runs with deno.land/jsr.io blocked).
//
//   /path/to/deno test --allow-env base44/tests/reports_logic_test.ts

import {
  LogicError,
  aggregate,
  hourOf,
  inWindow,
  resolveRange,
  type AggregateInput,
} from '../functions/reports/handlers/_logic.ts';
import { localDayRange, BAR_UTC_OFFSET_MIN } from '../../scripts/templates/_guard_logic.ts';

function eq(actual: unknown, expected: unknown, msg?: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(msg || `expected ${e}, got ${a}`);
}

function throwsCode(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (e) {
    if (!(e instanceof LogicError)) throw new Error('expected a LogicError');
    if (e.code !== code) throw new Error(`expected code ${code}, got ${e.code}`);
    return;
  }
  throw new Error('expected function to throw');
}

// Current period: local day 2026-09-28 -> [09-28T06:00Z, 09-29T06:00Z).
// Previous period: local day 2026-09-27.
const cur = localDayRange('2026-09-28');
const prev = localDayRange('2026-09-27');

function base(over: Partial<AggregateInput> = {}): AggregateInput {
  return {
    fromISO: cur.fromISO,
    toISO: cur.toISO,
    previousFromISO: prev.fromISO,
    previousToISO: prev.toISO,
    offsetMin: BAR_UTC_OFFSET_MIN,
    orders: [],
    items: [],
    payments: [],
    cancelledItems: [],
    products: [],
    categories: [],
    wasteMovements: [],
    inventoryItems: [],
    shifts: [],
    people: {},
    includeCosts: false,
    includeCashDifferences: true,
    ...over,
  };
}

// ---- resolveRange --------------------------------------------------------

Deno.test('resolveRange: one day, previous is the day before', () => {
  eq(resolveRange('2026-09-28', '2026-09-28'), {
    from: '2026-09-28',
    to: '2026-09-28',
    days: 1,
    previous_from: '2026-09-27',
    previous_to: '2026-09-27',
  });
});

Deno.test('resolveRange: a week gets the 7 days right before it (across a month)', () => {
  const r = resolveRange('2026-10-01', '2026-10-07');
  eq(r.days, 7);
  eq(r.previous_from, '2026-09-24');
  eq(r.previous_to, '2026-09-30');
});

Deno.test('resolveRange: 92 days ok, 93 days rejected', () => {
  eq(resolveRange('2026-01-01', '2026-04-02').days, 92);
  throwsCode(() => resolveRange('2026-01-01', '2026-04-03'), 'range_too_large');
});

Deno.test('resolveRange: rejects reversed, malformed and impossible dates', () => {
  throwsCode(() => resolveRange('2026-09-29', '2026-09-28'), 'invalid_range');
  throwsCode(() => resolveRange('28/09/2026', '2026-09-28'), 'invalid_date');
  throwsCode(() => resolveRange('2026-02-30', '2026-03-01'), 'invalid_date');
  throwsCode(() => resolveRange(undefined, '2026-03-01'), 'invalid_date');
});

// ---- boundary: local midnight ---------------------------------------------

Deno.test('boundary: 05:59:59.999Z is the previous local day, 06:00:00.000Z starts the next', () => {
  eq(cur.fromISO, '2026-09-28T06:00:00.000Z');
  eq(cur.toISO, '2026-09-29T06:00:00.000Z');
  eq(inWindow('2026-09-28T05:59:59.999Z', cur.fromISO, cur.toISO), false);
  eq(inWindow('2026-09-28T06:00:00.000Z', cur.fromISO, cur.toISO), true);
  eq(inWindow('2026-09-29T05:59:59.999Z', cur.fromISO, cur.toISO), true);
  eq(inWindow('2026-09-29T06:00:00.000Z', cur.fromISO, cur.toISO), false);
  eq(inWindow(undefined, cur.fromISO, cur.toISO), false);
  eq(hourOf('2026-09-29T05:59:59.999Z', -360), 23);
  eq(hourOf('2026-09-29T06:00:00.000Z', -360), 0);
});

Deno.test('boundary: orders at local midnight land in the right period and hour bucket', () => {
  const orders = [
    { id: 'prevLate', status: 'cobrada', closed_at: '2026-09-28T05:59:59.999Z', total: 1000, tip: 0 }, // 09-27 23:59 local
    { id: 'curFirst', status: 'cobrada', closed_at: '2026-09-28T06:00:00.000Z', total: 2000, tip: 0 }, // 09-28 00:00 local
    { id: 'curLast', status: 'cobrada', closed_at: '2026-09-29T05:59:59.999Z', total: 3000, tip: 0 }, // 09-28 23:59 local
    { id: 'next', status: 'cobrada', closed_at: '2026-09-29T06:00:00.000Z', total: 4000, tip: 0 }, // 09-29 00:00 local
  ];
  const out: any = aggregate(base({ orders }));
  eq(out.totals.orders, 2);
  eq(out.totals.sales, 5000);
  eq(out.previous_totals.orders, 1);
  eq(out.previous_totals.sales, 1000);
  eq(out.by_hour.length, 24);
  eq(out.by_hour[0], { hour: 0, orders: 1, sales: 2000 });
  eq(out.by_hour[23], { hour: 23, orders: 1, sales: 3000 });
});

// ---- totals ---------------------------------------------------------------

const t = (h: number) => `2026-09-28T${String(h).padStart(2, '0')}:00:00.000Z`;

Deno.test('totals: sales include tip, sales_net excludes it, avg ticket, discounts vs courtesies', () => {
  const orders = [
    { id: 'a', status: 'cobrada', closed_at: t(20), total: 11000, tip: 1000, discount: 0, opened_by: 'ana@x.mx' },
    { id: 'b', status: 'cobrada', closed_at: t(21), total: 9000, tip: 0, discount: 1000, discount_kind: 'descuento', opened_by: 'ana@x.mx' },
    { id: 'c', status: 'cobrada', closed_at: t(22), total: 0, tip: 0, discount: 5000, discount_kind: 'cortesia', discount_reason: 'Cliente frecuente', opened_by: 'beto@x.mx', closed_by: 'ana@x.mx' },
  ];
  const items = [
    { order_id: 'a', product_id: 'p1', name: 'Tabla', qty: 2, unit_price: 5000, status: 'entregado' },
    { order_id: 'a', product_id: 'p2', name: 'Copa', qty: 1, unit_price: 1000, status: 'entregado' },
    { order_id: 'b', product_id: 'p2', name: 'Copa', qty: 10, unit_price: 1000, status: 'entregado' },
    { order_id: 'c', product_id: 'p1', name: 'Tabla', qty: 1, unit_price: 5000, status: 'entregado' },
    { order_id: 'c', product_id: 'p2', name: 'Copa', qty: 5, unit_price: 1000, status: 'cancelado' },
  ];
  const payments = [
    { order_id: 'a', method: 'efectivo', method_label: 'Efectivo', amount: 11000 },
    { order_id: 'b', method: 'tarjeta', method_label: 'Tarjeta', amount: 9000 },
    { order_id: 'b', method: 'tarjeta', method_label: 'Tarjeta', amount: 500, voided_at: t(21) },
    { order_id: 'zzz', method: 'efectivo', method_label: 'Efectivo', amount: 99999 },
  ];
  const out: any = aggregate(base({ orders, items, payments, people: { 'ana@x.mx': 'Ana Ruiz' } }));
  eq(out.totals, {
    sales: 20000,
    sales_net: 19000,
    orders: 3,
    avg_ticket: 6667,
    tips: 1000,
    discounts: 1000,
    discounts_count: 1,
    courtesies: 5000,
    courtesies_count: 1,
    items_sold: 14, // 2 + 1 + 10 + 1, cancelled line skipped
  });
  eq(out.by_method, [
    { method: 'efectivo', label: 'Efectivo', count: 1, amount: 11000 },
    { method: 'tarjeta', label: 'Tarjeta', count: 1, amount: 9000 },
  ]);
  eq(out.by_person[0], { email: 'ana@x.mx', name: 'Ana Ruiz', orders: 2, sales: 20000 });
  eq(out.by_person[1].name, 'beto@x.mx'); // no name known: falls back to the email
  eq(out.courtesies.length, 1);
  eq(out.courtesies[0].reason, 'Cliente frecuente');
  eq(out.courtesies[0].closed_by_name, 'Ana Ruiz');
  eq(out.courtesies[0].amount, 5000);
});

Deno.test('by_product / by_category / top_products group and sort', () => {
  const orders = [{ id: 'a', status: 'cobrada', closed_at: t(20), total: 0 }];
  const items = [
    { order_id: 'a', product_id: 'p1', name: 'Tabla', variant: 'chico', variant_label: 'Chica', qty: 1, unit_price: 28000, status: 'entregado' },
    { order_id: 'a', product_id: 'p1', name: 'Tabla', variant: 'grande', variant_label: 'Grande', qty: 1, unit_price: 45000, status: 'entregado' },
    { order_id: 'a', product_id: 'p2', name: 'Copa', qty: 6, unit_price: 9000, status: 'entregado' },
    { order_id: 'a', product_id: 'gone', name: 'Viejo', qty: 1, unit_price: 100, status: 'entregado' },
  ];
  const out: any = aggregate(
    base({
      orders,
      items,
      products: [
        { id: 'p1', category_id: 'c1' },
        { id: 'p2', category_id: 'c2' },
      ],
      categories: [
        { id: 'c1', name: 'Tablas' },
        { id: 'c2', name: 'Vinos' },
      ],
    })
  );
  eq(out.by_product.map((r: any) => r.name), ['Copa', 'Tabla (Grande)', 'Tabla (Chica)', 'Viejo']);
  eq(out.by_category.map((r: any) => [r.name, r.sales]), [
    ['Tablas', 73000],
    ['Vinos', 54000],
    ['Sin categoría', 100],
  ]);
  eq(out.top_products[0].name, 'Copa'); // most units
  eq(out.top_products.length, 4);
  // No cost keys leak without permission.
  eq('cost' in out.by_product[0], false);
  eq('costs' in out, false);
});

Deno.test('top_products is capped at 10', () => {
  const orders = [{ id: 'a', status: 'cobrada', closed_at: t(20), total: 0 }];
  const items = Array.from({ length: 15 }, (_, i) => ({
    order_id: 'a', product_id: `p${i}`, name: `P${i}`, qty: i + 1, unit_price: 100, status: 'entregado',
  }));
  const out: any = aggregate(base({ orders, items }));
  eq(out.top_products.length, 10);
  eq(out.top_products[0].name, 'P14');
});

// ---- costs ------------------------------------------------------------------

Deno.test('costs: null cost is never counted as 0; profit only over costed lines', () => {
  const orders = [{ id: 'a', status: 'cobrada', closed_at: t(20), total: 0 }];
  const items = [
    { order_id: 'a', product_id: 'p1', name: 'Costeado', qty: 2, unit_price: 10000, unit_cost: 4000, status: 'entregado' },
    { order_id: 'a', product_id: 'p2', name: 'Sin costo', qty: 3, unit_price: 5000, unit_cost: null, status: 'entregado' },
    { order_id: 'a', product_id: 'p3', name: 'Indefinido', qty: 1, unit_price: 700, status: 'entregado' },
  ];
  const out: any = aggregate(base({ orders, items, includeCosts: true }));
  eq(out.costs, {
    cost: 8000,
    profit: 12000, // 20000 costed sales - 8000; the 15000 + 700 uncosted lines are NOT profit
    margin_pct: 60,
    uncosted_items: 2,
    costed_sales: 20000,
  });
  const sinCosto = out.by_product.find((r: any) => r.name === 'Sin costo');
  eq(sinCosto.cost, 0);
  eq(sinCosto.profit, 0);
  eq(sinCosto.uncosted, 1);
  eq(out.by_product.find((r: any) => r.name === 'Costeado').profit, 12000);
});

Deno.test('costs: nothing costed gives null margin, not NaN or 100%', () => {
  const orders = [{ id: 'a', status: 'cobrada', closed_at: t(20), total: 0 }];
  const items = [{ order_id: 'a', product_id: 'p', name: 'X', qty: 1, unit_price: 500, unit_cost: null, status: 'entregado' }];
  const out: any = aggregate(base({ orders, items, includeCosts: true }));
  eq(out.costs.margin_pct, null);
  eq(out.costs.profit, 0);
  eq(out.costs.uncosted_items, 1);
});

Deno.test('waste cost: null unit_cost stays null, and cost keys only with permission', () => {
  const wasteMovements = [
    { item_id: 'i1', qty: -2, reason: 'Se rompió', created_by: 'ana@x.mx', created_date: t(20), unit_cost: 5000 },
    { item_id: 'i1', qty: -1, reason: 'Caducó', created_date: t(21), unit_cost: null },
    { item_id: 'i1', qty: 0, reason: 'duplicado', created_date: t(22), unit_cost: 5000 }, // neutralized
    { item_id: 'i1', qty: -1, reason: 'Fuera de rango', created_date: '2026-09-30T00:00:00.000Z' },
  ];
  const inventoryItems = [{ id: 'i1', name: 'Malbec', unit: 'botella' }];
  const withCost: any = aggregate(base({ wasteMovements, inventoryItems, includeCosts: true }));
  eq(withCost.waste.count, 2);
  eq(withCost.waste.items[0].reason, 'Caducó'); // newest first
  eq(withCost.waste.items[0].cost, null);
  eq(withCost.waste.items[1].cost, 10000);
  eq(withCost.waste.items[1].qty, 2);
  eq(withCost.waste.items[1].name, 'Malbec');
  const noCost: any = aggregate(base({ wasteMovements, inventoryItems, includeCosts: false }));
  eq('cost' in noCost.waste.items[0], false);
});

// ---- cancellations / cash differences ---------------------------------------

Deno.test('cancellations: only cancelled lines cancelled inside the period, newest first', () => {
  const cancelledItems = [
    { name: 'Copa', qty: 1, status: 'cancelado', cancel_reason: 'Error', cancelled_by: 'ana@x.mx', prepared: true, updated_date: t(20) },
    { name: 'Tabla', variant_label: 'Chica', qty: 1, status: 'cancelado', cancel_reason: 'Cliente cambió', cancelled_by: 'beto@x.mx', updated_date: t(22) },
    { name: 'Vieja', qty: 1, status: 'cancelado', updated_date: '2026-09-28T05:59:59.999Z' },
    { name: 'No cancelada', qty: 1, status: 'entregado', updated_date: t(21) },
  ];
  const out: any = aggregate(base({ cancelledItems, people: { 'ana@x.mx': 'Ana Ruiz' } }));
  eq(out.cancellations.count, 2);
  eq(out.cancellations.items[0].name, 'Tabla (Chica)');
  eq(out.cancellations.items[1].cancelled_by_name, 'Ana Ruiz');
  eq(out.cancellations.items[1].prepared, true);
});

Deno.test('cash differences: only non-zero, closed in range; null without permission', () => {
  const shifts = [
    { id: 's1', closed_at: t(23), difference: -5000, close_comment: 'Faltó cambio' },
    { id: 's2', closed_at: t(22), difference: 0 },
    { id: 's3', closed_at: '2026-09-27T20:00:00.000Z', difference: 300 },
    { id: 's4', closed_at: t(21), difference: null },
  ];
  const out: any = aggregate(base({ shifts }));
  eq(out.cash_differences, [{ shift_id: 's1', closed_at: t(23), difference: -5000, comment: 'Faltó cambio' }]);
  const hidden: any = aggregate(base({ shifts, includeCashDifferences: false }));
  eq(hidden.cash_differences, null);
});

Deno.test('empty period: zeros, 24 hour buckets, no divide by zero', () => {
  const out: any = aggregate(base());
  eq(out.totals.avg_ticket, 0);
  eq(out.totals.sales, 0);
  eq(out.by_hour.length, 24);
  eq(out.by_product, []);
  eq(out.cancellations, { count: 0, items: [] });
});

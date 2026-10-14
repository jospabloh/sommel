// Deno tests for cleanReport (src/lib/reportShape.js): a reports.summary reply
// with missing blocks, null lists or numbers as text must still give the
// Reportes screen every key it reads. Zero external imports.
//   deno test --allow-env base44/tests/report_shape_test.ts
// @ts-ignore: plain JS module, the same file the client imports.
import { cleanReport } from '../../src/lib/reportShape.js';

function assertEquals(a: unknown, b: unknown, msg?: string) {
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  if (sa !== sb) throw new Error(`${msg ?? 'not equal'}: ${sa} !== ${sb}`);
}

const LISTS = ['by_product', 'top_products', 'by_category', 'by_person', 'by_method', 'by_hour', 'courtesies'];
const TOTALS = ['sales', 'sales_net', 'orders', 'avg_ticket', 'tips', 'discounts', 'discounts_count', 'courtesies', 'courtesies_count', 'items_sold'];

Deno.test('nothing at all still yields every block the screen reads', () => {
  for (const bad of [null, undefined, 'x', [], {}]) {
    const r = cleanReport(bad);
    for (const k of LISTS) assertEquals(r[k], [], k);
    for (const k of TOTALS) { assertEquals(r.totals[k], 0, k); assertEquals(r.previous_totals[k], 0, k); }
    assertEquals(r.cancellations, { count: 0, items: [] });
    assertEquals(r.waste, { count: 0, items: [] });
    assertEquals(r.range.from, '');
  }
});

Deno.test('optional blocks stay absent (the screen hides them when missing)', () => {
  const r = cleanReport({});
  assertEquals('costs' in r, false);
  assertEquals('cash_differences' in r, false);
  const withThem = cleanReport({ costs: { cost: '100', profit: null, margin_pct: null }, cash_differences: [{ shift_id: 's', difference: '-500' }] });
  assertEquals(withThem.costs.cost, 100);
  assertEquals(withThem.costs.profit, 0);
  assertEquals(withThem.costs.margin_pct, null, 'margin null means "Sin datos", it must survive');
  assertEquals(withThem.cash_differences[0].difference, -500);
});

Deno.test('numbers sent as text are coerced; junk becomes zero', () => {
  const r = cleanReport({ totals: { sales: '1500', orders: null, tips: 'abc', avg_ticket: true } });
  assertEquals(r.totals.sales, 1500);
  assertEquals(r.totals.orders, 0);
  assertEquals(r.totals.tips, 0);
  assertEquals(r.totals.avg_ticket, 0);
});

Deno.test('rows that are not objects are dropped, null names and numbers get defaults', () => {
  const r = cleanReport({
    by_product: [null, 4, { product_id: 'p', name: null, qty: null, sales: '250' }],
    waste: { count: '2', items: [{ name: null, qty: null, unit: undefined }, 'x'] },
    cancellations: { count: null, items: null },
  });
  assertEquals(r.by_product.length, 1);
  assertEquals(r.by_product[0].name, '');
  assertEquals(r.by_product[0].qty, 0);
  assertEquals(r.by_product[0].sales, 250);
  assertEquals(r.waste.count, 2);
  assertEquals(r.waste.items.length, 1);
  // The screen calls w.qty.toLocaleString(): it has to be a number.
  assertEquals(typeof r.waste.items[0].qty, 'number');
  assertEquals(r.cancellations, { count: 0, items: [] });
});

Deno.test('a good reply keeps every value it had', () => {
  const good = {
    range: { from: '2026-10-08', to: '2026-10-14', days: 7 },
    previous_range: { from: '2026-10-01', to: '2026-10-07', days: 7 },
    totals: Object.fromEntries(TOTALS.map((k, i) => [k, i * 100])),
    previous_totals: Object.fromEntries(TOTALS.map((k, i) => [k, i * 10])),
    by_product: [{ product_id: 'p', name: 'Vino', qty: 2, sales: 5000, cost: 0, profit: 0, uncosted: 1 }],
    by_hour: [{ hour: 0, orders: 0, sales: 0 }],
    cancellations: { count: 0, items: [] },
    waste: { count: 0, items: [] },
  };
  const r = cleanReport(good);
  assertEquals(r.totals, good.totals);
  assertEquals(r.by_product, good.by_product);
  assertEquals(r.range, good.range);
});

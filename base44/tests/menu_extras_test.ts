// Deno tests for MenuExtra (priced extras): the pure logic in
// orders/handlers/_logic.ts (resolveExtras, withExtras), catalog/handlers/
// _logic.ts (normalizeExtraInput, validateExtra, ...) and the ticket subline.
// Zero external imports, so it runs with deno.land/jsr.io blocked.
//
//   deno test --allow-env base44/tests/menu_extras_test.ts

import {
  LogicError,
  resolveExtras,
  withExtras,
  resolveItemPricing,
  MAX_EXTRAS_PER_LINE,
} from '../functions/orders/handlers/_logic.ts';
import {
  normalizeExtraInput,
  validateExtra,
  unknownProductIds,
  visibleExtras,
  EXTRA_PRICE_MAX,
} from '../functions/catalog/handlers/_logic.ts';
import { buildTicketLines } from '../functions/payments/handlers/_ticket.ts';
import { computeOrderTotals } from '../../scripts/templates/_guard_logic.ts';
import { extrasForProduct, extrasTotal, extraScopeLabel, pesosInputToCents } from '../../src/lib/extras.js';

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(msg || `expected ${e}, got ${a}`);
}

function assertThrowsCode(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (e) {
    if (!(e instanceof LogicError)) throw new Error('expected a LogicError');
    if (e.code !== code) throw new Error(`expected code ${code}, got ${e.code}`);
    return;
  }
  throw new Error('expected function to throw');
}

const CATALOG = [
  { id: 'x-shot', name: 'Shot extra', price: 1500, active: true, applies_to: 'all', product_ids: [], tenant_id: 't1' },
  { id: 'x-almond', name: 'Leche de almendra', price: 1000, active: true, applies_to: 'products', product_ids: ['p-latte'], tenant_id: 't1' },
  { id: 'x-off', name: 'Siropes', price: 500, active: false, applies_to: 'all', product_ids: [], tenant_id: 't1' },
  { id: 'x-other', name: 'De otro bar', price: 1, active: true, applies_to: 'all', product_ids: [], tenant_id: 't2' },
];

// ---- resolveExtras ----

Deno.test('resolveExtras: no extras requested means no extras and a zero total (every old client keeps working)', () => {
  assertEquals(resolveExtras(CATALOG, 'p-latte', undefined), { extras: [], total: 0 });
  assertEquals(resolveExtras(CATALOG, 'p-latte', null), { extras: [], total: 0 });
  assertEquals(resolveExtras(CATALOG, 'p-latte', []), { extras: [], total: 0 });
});

Deno.test('resolveExtras: an "all" extra applies to any product', () => {
  assertEquals(resolveExtras(CATALOG, 'p-anything', ['x-shot']), {
    extras: [{ id: 'x-shot', name: 'Shot extra', price: 1500 }],
    total: 1500,
  });
});

Deno.test('resolveExtras: a product-specific extra applies to its product', () => {
  assertEquals(resolveExtras(CATALOG, 'p-latte', ['x-almond']).total, 1000);
});

Deno.test('resolveExtras: a product-specific extra on another product is rejected, not dropped (stale menu or tampering)', () => {
  assertThrowsCode(() => resolveExtras(CATALOG, 'p-espresso', ['x-almond']), 'extra_not_applicable');
});

Deno.test('resolveExtras: an inactive extra cannot be added to new lines', () => {
  assertThrowsCode(() => resolveExtras(CATALOG, 'p-latte', ['x-off']), 'extra_inactive');
});

Deno.test('resolveExtras: unknown or non-string ids are rejected', () => {
  assertThrowsCode(() => resolveExtras(CATALOG, 'p-latte', ['nope']), 'extra_not_found');
  assertThrowsCode(() => resolveExtras(CATALOG, 'p-latte', [42]), 'extra_not_found');
  assertThrowsCode(() => resolveExtras(CATALOG, 'p-latte', ['']), 'extra_not_found');
});

Deno.test('resolveExtras: another bar\'s extra answers exactly like an unknown id (no cross-tenant oracle)', () => {
  assertThrowsCode(() => resolveExtras(CATALOG, 'p-latte', ['x-other'], 't1'), 'extra_not_found');
});

Deno.test('resolveExtras: the same extra twice on one line is rejected (would double-charge by accident)', () => {
  assertThrowsCode(() => resolveExtras(CATALOG, 'p-latte', ['x-shot', 'x-shot']), 'extra_duplicate');
});

Deno.test('resolveExtras: a non-array or an absurdly long list is rejected', () => {
  assertThrowsCode(() => resolveExtras(CATALOG, 'p-latte', 'x-shot'), 'extras_invalid');
  assertThrowsCode(
    () => resolveExtras(CATALOG, 'p-latte', Array.from({ length: MAX_EXTRAS_PER_LINE + 1 }, (_, i) => `e${i}`)),
    'extras_invalid'
  );
});

Deno.test('resolveExtras: the price comes from the STORED row and the total sums every extra', () => {
  const r = resolveExtras(CATALOG, 'p-latte', ['x-shot', 'x-almond']);
  assertEquals(r.total, 2500);
  assertEquals(r.extras.map((e) => e.id), ['x-shot', 'x-almond']);
});

Deno.test('resolveExtras: a stored extra with a broken price is refused rather than charged as 0', () => {
  const bad = [{ id: 'x', name: 'Roto', price: -5, active: true, applies_to: 'all' }];
  assertThrowsCode(() => resolveExtras(bad, 'p', ['x']), 'invalid_price');
  const frac = [{ id: 'x', name: 'Roto', price: 10.5, active: true, applies_to: 'all' }];
  assertThrowsCode(() => resolveExtras(frac, 'p', ['x']), 'invalid_price');
});

// ---- withExtras: unit_price = base + extras ----

Deno.test('withExtras: unit_price is base plus extras, unit_cost stays the base cost, extras are frozen on the line', () => {
  const product = { name: 'Latte', price: 6000, cost: 1800, station: 'bar' };
  const base = resolveItemPricing(product, {});
  const priced = withExtras(base, resolveExtras(CATALOG, 'p-latte', ['x-shot', 'x-almond']));
  assertEquals(priced.unit_price, 6000 + 2500);
  assertEquals(priced.unit_cost, 1800, 'extras have no cost');
  assertEquals(priced.extras, [
    { id: 'x-shot', name: 'Shot extra', price: 1500 },
    { id: 'x-almond', name: 'Leche de almendra', price: 1000 },
  ]);
});

Deno.test('withExtras: works on top of a variant price too', () => {
  const product = { name: 'Tabla', variants: [{ key: 'ch', label: 'Chico', price: 28000, cost: 9000 }] };
  const base = resolveItemPricing(product, { variant: 'ch' });
  assertEquals(withExtras(base, resolveExtras(CATALOG, 'p', ['x-shot'])).unit_price, 29500);
});

Deno.test('withExtras: with no extras the line is exactly what it was before extras existed', () => {
  const base = resolveItemPricing({ name: 'Copa', price: 9000, cost: null }, {});
  const priced = withExtras(base, resolveExtras(CATALOG, 'p', []));
  assertEquals(priced.unit_price, 9000);
  assertEquals(priced.unit_cost, null);
});

Deno.test('totals: because extras live inside unit_price, order totals need no change', () => {
  const t = computeOrderTotals([{ status: 'nuevo', unit_price: 6000 + 1500, qty: 2 }], {});
  assertEquals(t.subtotal, 15000);
});

// ---- catalog: normalize / validate ----

Deno.test('normalizeExtraInput: defaults for a new extra are active, applies to all, empty product list', () => {
  assertEquals(normalizeExtraInput({ name: '  Shot extra ', price: 1500 }), {
    name: 'Shot extra', price: 1500, applies_to: 'all', product_ids: [], active: true, sort: 0,
  });
});

Deno.test('normalizeExtraInput: product_ids are kept only for "products", trimmed and de-duplicated', () => {
  const f = normalizeExtraInput({ name: 'A', price: 1, applies_to: 'products', product_ids: [' p1 ', 'p1', 'p2', ''] });
  assertEquals(f.product_ids, ['p1', 'p2']);
  const all = normalizeExtraInput({ name: 'A', price: 1, applies_to: 'all', product_ids: ['p1'] });
  assertEquals(all.product_ids, [], 'a stale list must not survive switching to "all"');
});

Deno.test('normalizeExtraInput: an unknown applies_to falls back to "all"', () => {
  assertEquals(normalizeExtraInput({ name: 'A', price: 1, applies_to: 'x' }).applies_to, 'all');
});

Deno.test('normalizeExtraInput: a partial update keeps the stored fields (toggling active never wipes the rest)', () => {
  const stored = { name: 'Shot', price: 1500, applies_to: 'products', product_ids: ['p1'], active: true, sort: 3 };
  assertEquals(normalizeExtraInput({ active: false }, stored), {
    name: 'Shot', price: 1500, applies_to: 'products', product_ids: ['p1'], active: false, sort: 3,
  });
});

Deno.test('normalizeExtraInput: fractional, negative or garbage prices stay null so validation rejects them (never a free extra)', () => {
  for (const price of [10.5, -1, 'abc', '12,50']) {
    assertEquals(normalizeExtraInput({ name: 'A', price }).price, null);
  }
});

Deno.test('validateExtra: name, price bound and product list rules', () => {
  const ok = { name: 'Shot', price: 0, applies_to: 'all' as const, product_ids: [], active: true, sort: 0 };
  assertEquals(validateExtra(ok), null, 'a free extra (price 0) is allowed');
  if (!validateExtra({ ...ok, name: '' })) throw new Error('empty name must fail');
  if (!validateExtra({ ...ok, name: 'x'.repeat(61) })) throw new Error('name over 60 must fail');
  if (!validateExtra({ ...ok, price: null })) throw new Error('null price must fail');
  if (!validateExtra({ ...ok, price: EXTRA_PRICE_MAX + 1 })) throw new Error('price over the bound must fail');
  assertEquals(validateExtra({ ...ok, price: EXTRA_PRICE_MAX }), null);
  if (!validateExtra({ ...ok, applies_to: 'products' })) throw new Error('"products" with no products must fail');
});

Deno.test('unknownProductIds: ids outside the tenant\'s own products are flagged', () => {
  assertEquals(unknownProductIds(['p1', 'zzz'], ['p1', 'p2']), ['zzz']);
  assertEquals(unknownProductIds(['p1'], ['p1']), []);
});

Deno.test('visibleExtras: editors see inactive extras to reactivate them, everyone else only active ones', () => {
  const rows = [
    { name: 'B', active: true, sort: 1 },
    { name: 'A', active: false, sort: 0 },
  ];
  assertEquals(visibleExtras(rows, true).map((r) => r.name), ['A', 'B']);
  assertEquals(visibleExtras(rows, false).map((r) => r.name), ['B']);
});

// ---- ticket ----

Deno.test('ticket: each extra prints as an indented "+ name" subline and the line amount already includes it', () => {
  const lines = buildTicketLines({
    bar: { name: 'Bar' },
    when: '2026-10-13T20:00:00.000Z',
    place: 'Mesa 1',
    items: [
      { name: 'Latte', qty: 1, unit_price: 8500, status: 'entregado', extras: [{ name: 'Shot extra' }, { name: 'Leche de almendra' }] },
    ],
    order: { subtotal: 8500, discount: 0, tip: 0, total: 8500 },
    payments: [],
  });
  const texts = lines.map((l) => l.text);
  if (!texts.includes('  + Shot extra')) throw new Error('missing extra subline');
  if (!texts.includes('  + Leche de almendra')) throw new Error('missing second extra subline');
  if (!texts.some((t) => t.includes('$85.00'))) throw new Error('line amount should include extras');
  for (const t of texts) if (t.length > 32) throw new Error(`line too wide: ${t}`);
});

// ---- client helpers (src/lib/extras.js) ----

Deno.test('client extrasForProduct: offers only active extras that apply to the product', () => {
  assertEquals(extrasForProduct(CATALOG, 'p-latte').map((e: any) => e.id), ['x-shot', 'x-almond', 'x-other']);
  assertEquals(extrasForProduct(CATALOG, 'p-espresso').map((e: any) => e.id), ['x-shot', 'x-other']);
  assertEquals(extrasForProduct(undefined, 'p'), []);
});

Deno.test('client extrasTotal: previews the sum of the chosen extras only', () => {
  assertEquals(extrasTotal(CATALOG, ['x-shot', 'x-almond']), 2500);
  assertEquals(extrasTotal(CATALOG, []), 0);
});

Deno.test('client extraScopeLabel: "Todos los productos" or "N productos"', () => {
  assertEquals(extraScopeLabel({ applies_to: 'all' }), 'Todos los productos');
  assertEquals(extraScopeLabel({ applies_to: 'products', product_ids: ['a'] }), '1 producto');
  assertEquals(extraScopeLabel({ applies_to: 'products', product_ids: ['a', 'b'] }), '2 productos');
});

Deno.test('client pesosInputToCents: valid amounts convert, anything ambiguous is rejected instead of rounded', () => {
  assertEquals(pesosInputToCents('15'), 1500);
  assertEquals(pesosInputToCents('15.5'), 1550);
  assertEquals(pesosInputToCents('0'), 0);
  for (const bad of ['', 'abc', '-1', '12.505', '12,50', '1e3']) {
    assertEquals(pesosInputToCents(bad), null, `"${bad}" must be rejected`);
  }
});

// Deno tests for base44/functions/orders/handlers/_logic.ts — zero external
// imports in the file under test, so this runs even with deno.land/jsr.io
// blocked (same reasoning as guard_logic_test.ts / StockFlow's
// machinery_sales_fields_test.ts).
//
//   /path/to/deno test --allow-env base44/tests/orders_logic_test.ts

import {
  LogicError,
  resolveItemPricing,
  resolveModifiers,
  computeOrderTotals,
  validateQty,
  validateReason,
  isOrderOpen,
  canEditItem,
  canSendItem,
  canCancelItem,
  mergeTableIds,
} from '../functions/orders/handlers/_logic.ts';

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(msg || `expected ${e}, got ${a}`);
  }
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

// ---- resolveItemPricing: price/cost come from the PRODUCT, never the client ----

Deno.test('resolveItemPricing: simple product uses Product.price/cost, ignores any client price', () => {
  const product = { name: 'Copa de la casa', price: 8000, cost: 3000, active: true } as any;
  // opts never even has a "price" field to accept — this is the structural
  // guarantee that a client-sent price can't reach the frozen line.
  const result = resolveItemPricing(product, {});
  assertEquals(result.unit_price, 8000);
  assertEquals(result.unit_cost, 3000);
  assertEquals(result.variant, null);
});

Deno.test('resolveItemPricing: with variants, price/cost come from the CHOSEN variant, product.price/cost are ignored', () => {
  const product = {
    name: 'Botella de vino',
    price: 99999, // deliberately wrong/unused, to prove it is ignored
    cost: 99999,
    active: true,
    variants: [
      { key: 'chico', label: 'Chico', price: 5000, cost: 2000 },
      { key: 'grande', label: 'Grande', price: 9000, cost: 3500 },
    ],
  } as any;
  const result = resolveItemPricing(product, { variant: 'grande' });
  assertEquals(result.unit_price, 9000);
  assertEquals(result.unit_cost, 3500);
  assertEquals(result.variant, 'grande');
});

Deno.test('resolveItemPricing: freezes the variant LABEL too, not just its key (fixed 2026-09-28)', () => {
  const product = {
    name: 'Tabla de quesos',
    active: true,
    variants: [{ key: 'chico_2_4_personas', label: 'Chico (2-4 personas)', price: 5000, cost: 2000 }],
  } as any;
  const result = resolveItemPricing(product, { variant: 'chico_2_4_personas' });
  assertEquals(result.variant, 'chico_2_4_personas');
  assertEquals(result.variant_label, 'Chico (2-4 personas)');
});

Deno.test('resolveItemPricing: a simple product (no variants) has no variant_label', () => {
  const product = { name: 'Copa de la casa', price: 8000, cost: 3000, active: true } as any;
  const result = resolveItemPricing(product, {});
  assertEquals(result.variant_label, null);
});

Deno.test('resolveItemPricing: variant required when product has variants', () => {
  const product = {
    name: 'Botella de vino',
    active: true,
    variants: [{ key: 'chico', label: 'Chico', price: 5000, cost: 2000 }],
  } as any;
  assertThrowsCode(() => resolveItemPricing(product, {}), 'variant_required');
});

Deno.test('resolveItemPricing: unknown variant key is rejected, not silently ignored', () => {
  const product = {
    name: 'Botella de vino',
    active: true,
    variants: [{ key: 'chico', label: 'Chico', price: 5000, cost: 2000 }],
  } as any;
  assertThrowsCode(() => resolveItemPricing(product, { variant: 'gigante' }), 'variant_not_found');
});

Deno.test('resolveItemPricing: a variant key on a product with no variants is rejected', () => {
  const product = { name: 'Café', price: 3000, active: true } as any;
  assertThrowsCode(() => resolveItemPricing(product, { variant: 'chico' }), 'variant_not_found');
});

Deno.test('resolveItemPricing: variant cost null (aún no capturado) falls back to 0, not an error', () => {
  const product = {
    name: 'Vino de temporada',
    active: true,
    variants: [{ key: 'copa', label: 'Copa', price: 6000, cost: null }],
  } as any;
  const result = resolveItemPricing(product, { variant: 'copa' });
  assertEquals(result.unit_cost, 0);
});

Deno.test('resolveItemPricing: inactive product is rejected', () => {
  const product = { name: 'Descontinuado', price: 1000, active: false } as any;
  assertThrowsCode(() => resolveItemPricing(product, {}), 'product_inactive');
});

Deno.test('resolveItemPricing: modifiers must exist on the product, freezes {key,label}', () => {
  const product = {
    name: 'Té',
    price: 4000,
    active: true,
    modifiers: [{ key: 'leche', label: 'En leche' }],
  } as any;
  const result = resolveItemPricing(product, { modifiers: ['leche'] });
  assertEquals(result.modifiers, [{ key: 'leche', label: 'En leche' }]);
});

Deno.test('resolveItemPricing: unknown modifier key is rejected', () => {
  const product = { name: 'Té', price: 4000, active: true, modifiers: [{ key: 'leche', label: 'En leche' }] } as any;
  assertThrowsCode(() => resolveItemPricing(product, { modifiers: ['miel'] }), 'modifier_not_found');
});

Deno.test('resolveModifiers: duplicate keys collapse to one', () => {
  const catalog = [{ key: 'leche', label: 'En leche' }];
  assertEquals(resolveModifiers(catalog, ['leche', 'leche']), [{ key: 'leche', label: 'En leche' }]);
});

// ---- validateQty ----

Deno.test('validateQty: positive integers pass', () => {
  assertEquals(validateQty(1), 1);
  assertEquals(validateQty(5), 5);
});

Deno.test('validateQty: rejects zero, negatives, and non-integers', () => {
  assertThrowsCode(() => validateQty(0), 'invalid_qty');
  assertThrowsCode(() => validateQty(-1), 'invalid_qty');
  assertThrowsCode(() => validateQty(1.5), 'invalid_qty');
  assertThrowsCode(() => validateQty('2'), 'invalid_qty');
});

// ---- validateReason ----

Deno.test('validateReason: rejects empty/whitespace-only, trims otherwise', () => {
  assertThrowsCode(() => validateReason(''), 'reason_required');
  assertThrowsCode(() => validateReason('   '), 'reason_required');
  assertThrowsCode(() => validateReason(undefined), 'reason_required');
  assertEquals(validateReason('  se equivocó de mesa  '), 'se equivocó de mesa');
});

// ---- computeOrderTotals: excludes cancelled lines ----

Deno.test('computeOrderTotals: sums unit_price*qty over non-cancelled lines only', () => {
  const items = [
    { status: 'nuevo', unit_price: 1000, qty: 2 }, // 2000
    { status: 'enviado', unit_price: 500, qty: 3 }, // 1500
    { status: 'cancelado', unit_price: 9999, qty: 99 }, // excluded
    { status: 'entregado', unit_price: 200, qty: 1 }, // 200
  ];
  const { subtotal, total } = computeOrderTotals(items);
  assertEquals(subtotal, 3700);
  assertEquals(total, subtotal); // no discount/tip yet in Entrega 1
});

Deno.test('computeOrderTotals: all cancelled yields 0', () => {
  const items = [{ status: 'cancelado', unit_price: 1000, qty: 5 }];
  assertEquals(computeOrderTotals(items), { subtotal: 0, total: 0 });
});

Deno.test('computeOrderTotals: empty order yields 0', () => {
  assertEquals(computeOrderTotals([]), { subtotal: 0, total: 0 });
});

// ---- state transitions ----

Deno.test('isOrderOpen: only "abierta" is open', () => {
  assertEquals(isOrderOpen('abierta'), true);
  assertEquals(isOrderOpen('cobrada'), false);
  assertEquals(isOrderOpen('cancelada'), false);
  assertEquals(isOrderOpen(null), false);
});

Deno.test('canEditItem: update/remove only allowed on "nuevo"', () => {
  assertEquals(canEditItem('nuevo'), true);
  assertEquals(canEditItem('enviado'), false);
  assertEquals(canEditItem('listo'), false);
  assertEquals(canEditItem('entregado'), false);
  assertEquals(canEditItem('cancelado'), false);
});

Deno.test('canSendItem: send only picks up "nuevo" -> "enviado" transition', () => {
  assertEquals(canSendItem('nuevo'), true);
  assertEquals(canSendItem('enviado'), false);
  assertEquals(canSendItem('listo'), false);
  assertEquals(canSendItem('cancelado'), false);
});

Deno.test('canCancelItem: cancel only from "enviado" or "listo"', () => {
  assertEquals(canCancelItem('enviado'), true);
  assertEquals(canCancelItem('listo'), true);
  assertEquals(canCancelItem('nuevo'), false);
  assertEquals(canCancelItem('entregado'), false);
  assertEquals(canCancelItem('cancelado'), false);
});

// ---- mergeTableIds ----

Deno.test('mergeTableIds: unions and de-duplicates, ignores empty/null', () => {
  assertEquals(mergeTableIds(['a', 'b'], ['b', 'c']), ['a', 'b', 'c']);
  assertEquals(mergeTableIds(null, ['a']), ['a']);
  assertEquals(mergeTableIds(['a'], undefined), ['a']);
  assertEquals(mergeTableIds([], []), []);
});

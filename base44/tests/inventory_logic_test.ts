// Deno tests for base44/functions/inventory/handlers/_logic.ts (zero imports).
//   deno test --allow-env base44/tests/inventory_logic_test.ts
import {
  LogicError, round3, computeStock, lowStockIds, validatePositiveQty, validateCounted, countDelta,
  validateWasteReason, normalizeOptionalReason, validateIdempotencyKey, validateUnitCost, applyUnitCost,
  redactUnitCost, normalizeItemFields, resolveLinkQuantities, redactProductCosts, clampLimit,
} from '../functions/inventory/handlers/_logic.ts';

function eq(actual: unknown, expected: unknown, msg?: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(msg || `expected ${e}, got ${a}`);
}
function throwsCode(fn: () => unknown, code: string) {
  try { fn(); } catch (e) {
    if (!(e instanceof LogicError)) throw new Error('expected a LogicError');
    if (e.code !== code) throw new Error(`expected code ${code}, got ${e.code}`);
    return;
  }
  throw new Error('expected function to throw');
}

Deno.test('round3 kills float drift', () => { eq(round3(0.1 + 0.2), 0.3); eq(round3(1.23456), 1.235); });

Deno.test('computeStock sums qty and rounds', () => {
  eq(computeStock([{ qty: 0.1 }, { qty: 0.2 }, { qty: -0.05 }]), 0.25);
  eq(computeStock([]), 0);
  eq(computeStock([{ qty: 10 }, { qty: -3 }, { qty: 0 }, { qty: null }]), 7);
});

Deno.test('a neutralized duplicate (qty 0) does not change stock', () => {
  eq(computeStock([{ qty: 12 }, { qty: 5 }, { qty: 0 }]), 17);
});

Deno.test('lowStockIds: stock <= threshold', () => {
  eq(lowStockIds([
    { id: 'a', stock: 2, low_threshold: 3 },
    { id: 'b', stock: 3, low_threshold: 3 },
    { id: 'c', stock: 4, low_threshold: 3 },
    { id: 'd', stock: 0 },
  ]), ['a', 'b', 'd']);
});

Deno.test('validatePositiveQty', () => {
  eq(validatePositiveQty(2.5), 2.5);
  eq(validatePositiveQty(0.0004 + 0.0007), 0.001);
  for (const bad of [0, -1, NaN, Infinity, '3', null, undefined, 0.0001, 2_000_000]) throwsCode(() => validatePositiveQty(bad), 'invalid_qty');
});

Deno.test('validateCounted allows zero, rejects negatives', () => {
  eq(validateCounted(0), 0);
  eq(validateCounted(7.25), 7.25);
  throwsCode(() => validateCounted(-1), 'invalid_counted');
  throwsCode(() => validateCounted('4'), 'invalid_counted');
});

Deno.test('countDelta: counted minus current stock', () => {
  eq(countDelta(8, 10), -2);
  eq(countDelta(10, 7.5), 2.5);
  eq(countDelta(3, 3), 0);
  eq(countDelta(0.3, 0.1), 0.2);
});

Deno.test('waste reason is mandatory', () => {
  eq(validateWasteReason('  se cayó  '), 'se cayó');
  throwsCode(() => validateWasteReason(''), 'reason_required');
  throwsCode(() => validateWasteReason('   '), 'reason_required');
  throwsCode(() => validateWasteReason(undefined), 'reason_required');
  throwsCode(() => validateWasteReason('x'.repeat(201)), 'invalid_reason');
});

Deno.test('optional reason', () => {
  eq(normalizeOptionalReason(undefined), '');
  eq(normalizeOptionalReason(' hola '), 'hola');
  throwsCode(() => normalizeOptionalReason(5), 'invalid_reason');
});

Deno.test('idempotency key required', () => {
  eq(validateIdempotencyKey(' abc '), 'abc');
  throwsCode(() => validateIdempotencyKey(''), 'invalid_idempotency_key');
  throwsCode(() => validateIdempotencyKey(undefined), 'invalid_idempotency_key');
  throwsCode(() => validateIdempotencyKey('k'.repeat(121)), 'invalid_idempotency_key');
});

Deno.test('unit cost validation', () => {
  eq(validateUnitCost(0), 0);
  eq(validateUnitCost(1250), 1250);
  eq(validateUnitCost(null), null);
  throwsCode(() => validateUnitCost(12.5), 'invalid_cost');
  throwsCode(() => validateUnitCost(-1), 'invalid_cost');
  throwsCode(() => validateUnitCost('12'), 'invalid_cost');
});

Deno.test('applyUnitCost keeps stored cost when absent or unauthorized', () => {
  eq(applyUnitCost({}, true, 900), 900, 'absent keeps');
  eq(applyUnitCost({ unit_cost: 100 }, false, 900), 900, 'unauthorized ignored, even if tampered');
  eq(applyUnitCost({ unit_cost: 0 }, false, 900), 900);
  eq(applyUnitCost({}, false, undefined), null);
  eq(applyUnitCost({ unit_cost: 100 }, true, 900), 100);
  eq(applyUnitCost({ unit_cost: null }, true, 900), null, 'authorized null clears');
  throwsCode(() => applyUnitCost({ unit_cost: 1.5 }, true, 900), 'invalid_cost');
});

Deno.test('redactUnitCost', () => {
  eq(redactUnitCost({ id: 'a', unit_cost: 5 }, false), { id: 'a' });
  eq(redactUnitCost({ id: 'a', unit_cost: 5 }, true), { id: 'a', unit_cost: 5 });
});

Deno.test('normalizeItemFields: create', () => {
  eq(normalizeItemFields({ name: ' Malbec ', unit: 'botella', low_threshold: 3 }), { name: 'Malbec', unit: 'botella', low_threshold: 3 });
  eq(normalizeItemFields({ name: 'Limón', unit: 'pieza' }), { name: 'Limón', unit: 'pieza', low_threshold: 0 });
  throwsCode(() => normalizeItemFields({ unit: 'g' }), 'invalid_name');
  throwsCode(() => normalizeItemFields({ name: 'x', unit: 'litro' }), 'invalid_unit');
  throwsCode(() => normalizeItemFields({ name: 'x' }), 'invalid_unit');
  throwsCode(() => normalizeItemFields({ name: 'x', unit: 'g', low_threshold: -1 }), 'invalid_threshold');
});

Deno.test('normalizeItemFields: update keeps stored fields, ignores stock in body', () => {
  const existing = { name: 'Malbec', unit: 'botella', low_threshold: 4 };
  const out = normalizeItemFields({ name: 'Malbec Reserva', stock: 999 } as never, existing);
  eq(out, { name: 'Malbec Reserva', unit: 'botella', low_threshold: 4 });
  eq('stock' in out, false);
});

Deno.test('resolveLinkQuantities: plain product', () => {
  eq(resolveLinkQuantities({}, { inventory_qty: 150 }), { inventory_qty: 150 });
  eq(resolveLinkQuantities({}, {}), { inventory_qty: 1 });
  eq(resolveLinkQuantities({ inventory_qty: 2 }, {}), { inventory_qty: 2 });
  throwsCode(() => resolveLinkQuantities({}, { inventory_qty: 0 }), 'invalid_qty');
});

Deno.test('resolveLinkQuantities: variants merge and keep other fields', () => {
  const product = {
    variants: [
      { key: 'copa', label: 'Copa', price: 9000, cost: 2000, inventory_qty: 150 },
      { key: 'botella', label: 'Botella', price: 40000, cost: 15000 },
    ],
  };
  const out = resolveLinkQuantities(product, { variant_qtys: { botella: 750 } });
  eq(out.variants, [
    { key: 'copa', label: 'Copa', price: 9000, cost: 2000, inventory_qty: 150 },
    { key: 'botella', label: 'Botella', price: 40000, cost: 15000, inventory_qty: 750 },
  ]);
  throwsCode(() => resolveLinkQuantities(product, { variant_qtys: { grande: 1 } }), 'unknown_variant');
  throwsCode(() => resolveLinkQuantities(product, { variant_qtys: { copa: -1 } }), 'invalid_qty');
  throwsCode(() => resolveLinkQuantities(product, { variant_qtys: [] }), 'invalid_variant_qtys');
  throwsCode(() => resolveLinkQuantities({ variants: [{ key: 'a' }] }, {}), 'invalid_qty');
  eq(resolveLinkQuantities({ variants: [{ key: 'a' }, { key: 'b' }] }, { variant_qtys: { a: 0, b: 2 } }).variants,
    [{ key: 'a', inventory_qty: 0 }, { key: 'b', inventory_qty: 2 }]);
});

Deno.test('redactProductCosts strips cost and variants[].cost', () => {
  const p = { id: 'p', cost: 5, variants: [{ key: 'a', cost: 3, price: 9 }] };
  eq(redactProductCosts(p, false), { id: 'p', variants: [{ key: 'a', price: 9 }] });
  eq(redactProductCosts(p, true), p);
});

Deno.test('clampLimit', () => {
  eq(clampLimit(undefined), 50); eq(clampLimit(10), 10); eq(clampLimit(9999), 200); eq(clampLimit(-3), 50); eq(clampLimit(2.5), 50);
});

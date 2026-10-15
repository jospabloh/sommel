// Negative stock setting (José, 2026-10-15): off by default; lines and waste
// that would push a supply below zero are refused.
//   deno test --allow-env base44/tests/negative_stock_test.ts
import { negativeStockAllowed, stockNeeds, assertStockCovers, LogicError } from '../functions/orders/handlers/_logic.ts';
import { assertWasteFits, negativeStockAllowed as invAllowed } from '../functions/inventory/handlers/_logic.ts';
import { buildSettingsPatch } from '../functions/settings/handlers/_logic.ts';

function assert(cond: unknown, msg = 'assert'): asserts cond {
  if (!cond) throw new Error(msg);
}
function throwsCode(fn: () => void, code: string): string {
  try {
    fn();
  } catch (err) {
    assert(err instanceof Error && (err as any).code === code, `expected ${code}, got ${(err as any)?.code}`);
    return (err as Error).message;
  }
  throw new Error(`expected ${code}, nothing thrown`);
}

const malbec = { track_inventory: true, inventory_item_id: 'inv1', inventory_qty: 150, variants: [{ key: 'botella', inventory_qty: 750 }] };
const water = { track_inventory: false, inventory_item_id: null, inventory_qty: null };

Deno.test('negative stock is off unless the bar saved true', () => {
  assert(negativeStockAllowed({}) === false && negativeStockAllowed(null) === false);
  assert(negativeStockAllowed({ allow_negative_stock: false }) === false);
  assert(negativeStockAllowed({ allow_negative_stock: 'true' }) === false, 'only a boolean true');
  assert(negativeStockAllowed({ allow_negative_stock: true }) === true);
  assert(invAllowed({ allow_negative_stock: true }) === true && invAllowed({}) === false, 'inventory copy agrees');
});

Deno.test('stockNeeds sums per supply, honors variants and skips untracked', () => {
  const needs = stockNeeds([
    { product: malbec, variant: null, qty: 2 },
    { product: malbec, variant: 'botella', qty: 1 },
    { product: water, variant: null, qty: 5 },
    { product: malbec, variant: null, qty: 0 },
  ]);
  assert(needs.size === 1 && needs.get('inv1') === 1050, JSON.stringify([...needs]));
});

Deno.test('assertStockCovers refuses a short supply and accepts an exact fit', () => {
  const needs = new Map([['inv1', 300]]);
  assertStockCovers(needs, new Map([['inv1', { name: 'Malbec', unit: 'ml', stock: 300 }]]));
  const msg = throwsCode(() => assertStockCovers(needs, new Map([['inv1', { name: 'Malbec', unit: 'ml', stock: 299.5 }]])), 'insufficient_stock');
  assert(msg.includes('Malbec') && msg.includes('299.5 ml') && msg.includes('300 ml'), msg);
  throwsCode(() => assertStockCovers(needs, new Map([['inv1', { name: 'Malbec', stock: -20 }]])), 'insufficient_stock');
  assert(throwsCode(() => assertStockCovers(needs, new Map([['inv1', { name: 'X', stock: -20 }]])), 'insufficient_stock').includes('quedan 0'), 'never shows a negative left');
  assertStockCovers(needs, new Map()); // unknown supply: the cobro skips it too
});

Deno.test('assertWasteFits: refused past zero, allowed when the bar allows it', () => {
  assertWasteFits(10, 10, false, { name: 'Hielo', unit: 'g' });
  const msg = throwsCode(() => assertWasteFits(10, 10.5, false, { name: 'Hielo', unit: 'g' }), 'insufficient_stock');
  assert(msg.includes('Hielo') && msg.includes('10 g'), msg);
  assertWasteFits(10, 50, true, { name: 'Hielo' });
  assertWasteFits(0.1 + 0.2, 0.3, false, {}); // float noise is not a shortfall
});

Deno.test('settings.update accepts allow_negative_stock as a boolean only', () => {
  assert(buildSettingsPatch({ allow_negative_stock: true }, []).allow_negative_stock === true);
  assert(buildSettingsPatch({ allow_negative_stock: false }, []).allow_negative_stock === false);
  throwsCode(() => buildSettingsPatch({ allow_negative_stock: 'yes' }, []), 'invalid_value');
});

Deno.test('LogicError is the error type of the orders rule', () => {
  try {
    assertStockCovers(new Map([['a', 1]]), new Map([['a', { stock: 0 }]]));
  } catch (err) {
    assert(err instanceof LogicError);
  }
});

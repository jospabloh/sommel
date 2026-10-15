// QA fixes 2026-10-14 (grupo comandas y mesas). Zero external imports.
import {
  LogicError,
  isRepeatedCancel,
  validateTableFields,
  planCancelOrderInventory,
} from '../functions/orders/handlers/_logic.ts';
import { computeOrderTotals } from '../../scripts/templates/_guard_logic.ts';
// @ts-ignore: plain JS module, the same file the client imports.
import { splitTablesByPlacement } from '../../src/components/orders/tableLayout.js';

function eq(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`);
}
function code(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof LogicError) return e.code;
    throw e;
  }
  return 'none';
}

Deno.test('isRepeatedCancel: same line, reason and person is a retry', () => {
  const item = { status: 'cancelado', cancel_reason: 'Error', cancelled_by: 'a@x.com' };
  eq(isRepeatedCancel(item, 'Error', 'a@x.com'), true);
  eq(isRepeatedCancel(item, 'Otro', 'a@x.com'), false);
  eq(isRepeatedCancel(item, 'Error', 'b@x.com'), false);
  eq(isRepeatedCancel({ ...item, status: 'enviado' }, 'Error', 'a@x.com'), false);
});

Deno.test('validateTableFields: seats integer 0..99, zone text', () => {
  eq(code(() => validateTableFields({ seats: 'abc' })), 'invalid_seats');
  eq(code(() => validateTableFields({ seats: '4' })), 'invalid_seats');
  eq(code(() => validateTableFields({ seats: -3 })), 'invalid_seats');
  eq(code(() => validateTableFields({ seats: 1.5 })), 'invalid_seats');
  eq(code(() => validateTableFields({ seats: 100 })), 'invalid_seats');
  eq(code(() => validateTableFields({ zone: 5 })), 'invalid_zone');
  eq(code(() => validateTableFields({ x: 'a' })), 'invalid_position');
  eq(validateTableFields({ seats: 0 }), { seats: 0 });
  eq(validateTableFields({ seats: 99, zone: '  Barra ' }), { seats: 99, zone: 'Barra' });
  // '' clears the zone; an absent key keeps it.
  eq(validateTableFields({ zone: '' }), { zone: '' });
  eq(validateTableFields({}), {});
});

Deno.test('totals of a fully cancelled order are zero', () => {
  const t = computeOrderTotals(
    [{ status: 'cancelado', unit_price: 51000, qty: 1 }],
    { discount_kind: null, discount_pct: null, discount: 0, tip_pct: null, tip: 0 }
  );
  eq([t.subtotal, t.total], [0, 0]);
});

const product = { track_inventory: true, inventory_item_id: 'inv1', inventory_qty: 0.15 };

Deno.test('planCancelOrderInventory: prepared line without sale -> merma', () => {
  const out = planCancelOrderInventory([{ id: 'l1', product_id: 'p', qty: 2, prepared: true }], { p: product }, new Map());
  eq(out.length, 1);
  eq([out[0].type, out[0].qty, out[0].idempotency_key], ['merma', -0.3, 'merma:l1']);
});

Deno.test('planCancelOrderInventory: unprepared line without sale -> nothing', () => {
  eq(planCancelOrderInventory([{ id: 'l1', product_id: 'p', qty: 2, prepared: false }], { p: product }, new Map()), []);
});

Deno.test('planCancelOrderInventory: voided-payment sale, unprepared -> devolucion', () => {
  const ventas = new Map([['l1', { qty: -0.3, item_id: 'inv1' }]]);
  const out = planCancelOrderInventory([{ id: 'l1', product_id: 'p', qty: 2, prepared: false }], { p: product }, ventas);
  eq([out[0].type, out[0].qty, out[0].idempotency_key], ['devolucion', 0.3, 'reversa:l1']);
});

Deno.test('planCancelOrderInventory: voided-payment sale, prepared -> sale stands, no double waste', () => {
  const ventas = new Map([['l1', { qty: -0.3, item_id: 'inv1' }]]);
  eq(planCancelOrderInventory([{ id: 'l1', product_id: 'p', qty: 2, prepared: true }], { p: product }, ventas), []);
});

Deno.test('planCancelOrderInventory: untracked product -> nothing', () => {
  eq(planCancelOrderInventory([{ id: 'l1', product_id: 'p', qty: 1, prepared: true }], { p: { track_inventory: false } }, new Map()), []);
});

Deno.test('splitTablesByPlacement: tables without x/y are not placed at 0,0', () => {
  const tables = [{ id: 'a', x: 10, y: 20 }, { id: 'b' }, { id: 'c', x: 5 }, { id: 'd', x: 0, y: 0 }];
  const { placed, unplaced } = splitTablesByPlacement(tables);
  eq(placed.map((t: any) => t.id), ['a', 'd']);
  eq(unplaced.map((t: any) => t.id), ['b', 'c']);
  eq(splitTablesByPlacement([{ id: 'z' }]).placed, []);
});

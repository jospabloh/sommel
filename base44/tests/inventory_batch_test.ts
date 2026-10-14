// Batched inventory reads (2026-10-14). Base44's rate limit is app-wide and
// counts entity operations, so deductInventory reads with `$in` instead of one
// query per row. These are the pure helpers behind it; each test says what
// would go wrong for the bar if it broke.
//   deno test --allow-env base44/tests/inventory_batch_test.ts
import {
  chunk,
  collectMovementKeys,
  duplicatesToNeutralize,
  groupByField,
  mermaCoveredBySale,
  narrowByField,
  planInventoryMovements,
} from '../functions/payments/handlers/_logic.ts';
import { narrowByField as narrowOrders } from '../functions/orders/handlers/_logic.ts';
import { pickSurvivor } from '../../scripts/templates/_guard_logic.ts';

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg ?? 'assertEquals'}: expected ${e}, got ${a}`);
}

Deno.test('ids are split in chunks of 100 so one $in never carries a huge list', () => {
  const ids = Array.from({ length: 250 }, (_, i) => `id${i}`);
  assertEquals(chunk(ids).map((c) => c.length), [100, 100, 50]);
  assertEquals(chunk([]), [], 'nothing to read, no query');
});

Deno.test('rows the operator should have excluded are dropped in memory', () => {
  // A backend that ignores `$in` answers with every row. Acting on those would
  // deduct (or skip) the wrong supplies, so the result is re-narrowed.
  const rows = [{ id: 'a' }, { id: 'b' }, { id: 'zzz' }];
  assertEquals(narrowByField(rows, 'id', ['a', 'b']), [{ id: 'a' }, { id: 'b' }]);
  assertEquals(narrowByField([{ idempotency_key: 'venta:1' }, { idempotency_key: 'venta:9' }], 'idempotency_key', ['venta:1']), [
    { idempotency_key: 'venta:1' },
  ]);
  assertEquals(narrowByField([null as any, { id: 'a' }], 'id', ['a']), [{ id: 'a' }], 'a null row never throws');
  assertEquals(narrowOrders([{ id: 't1' }, { id: 't9' }], 'id', ['t1']), [{ id: 't1' }], 'orders copy narrows the same way');
});

Deno.test('one query asks for the planned keys AND the sale key of every merma', () => {
  const planned = [
    { type: 'venta', order_item_id: 'i1', idempotency_key: 'venta:i1' },
    { type: 'merma', order_item_id: 'i2', idempotency_key: 'merma:i2' },
    { type: 'merma', order_item_id: 'i1', idempotency_key: 'merma:i1' },
  ];
  assertEquals(collectMovementKeys(planned).sort(), ['merma:i1', 'merma:i2', 'venta:i1', 'venta:i2']);
});

Deno.test('a merma is skipped when a sale row with qty != 0 exists in the batched result', () => {
  // Order closed, reopened, then the line was cancelled as prepared: the stock
  // already left as a sale, so a merma on top would deduct it twice.
  const merma = { type: 'merma', order_item_id: 'i1' };
  const sold = groupByField([{ idempotency_key: 'venta:i1', qty: -2 }], 'idempotency_key');
  assertEquals(mermaCoveredBySale(merma, sold), true);
  // A sale row already neutralized (qty 0, a duplicate) deducted nothing: the merma is real.
  const neutralized = groupByField([{ idempotency_key: 'venta:i1', qty: 0 }], 'idempotency_key');
  assertEquals(mermaCoveredBySale(merma, neutralized), false);
  // Another line's sale never covers this one.
  const other = groupByField([{ idempotency_key: 'venta:i7', qty: -2 }], 'idempotency_key');
  assertEquals(mermaCoveredBySale(merma, other), false);
  // A venta is never "covered": only merma looks at sales.
  assertEquals(mermaCoveredBySale({ type: 'venta', order_item_id: 'i1' }, sold), false);
});

Deno.test('duplicates are neutralized per key from ONE batched re-read', () => {
  // Two keys came back together. Key A was created twice by concurrent closers,
  // key B once. Only A's loser is zeroed; B is untouched and A keeps its oldest.
  const rows = [
    { id: 'a2', idempotency_key: 'venta:A', qty: -1, created_date: '2026-10-14T10:00:02Z' },
    { id: 'a1', idempotency_key: 'venta:A', qty: -1, created_date: '2026-10-14T10:00:01Z' },
    { id: 'b1', idempotency_key: 'venta:B', qty: -3, created_date: '2026-10-14T10:00:05Z' },
  ];
  assertEquals(duplicatesToNeutralize(rows, pickSurvivor).map((r) => r.id), ['a2']);
});

Deno.test('an already neutralized duplicate is not written again', () => {
  const rows = [
    { id: 'a1', idempotency_key: 'venta:A', qty: -1, created_date: '2026-10-14T10:00:01Z' },
    { id: 'a2', idempotency_key: 'venta:A', qty: 0, created_date: '2026-10-14T10:00:02Z' },
  ];
  assertEquals(duplicatesToNeutralize(rows, pickSurvivor), [], 'no extra operation on a retry');
});

Deno.test('grouping by item keeps each supply\'s movements apart for the stock recompute', () => {
  const g = groupByField(
    [
      { item_id: 's1', qty: -1 },
      { item_id: 's2', qty: 5 },
      { item_id: 's1', qty: 10 },
    ],
    'item_id',
  );
  assertEquals(g.get('s1')!.map((r) => r.qty), [-1, 10]);
  assertEquals(g.get('s2')!.map((r) => r.qty), [5]);
  assertEquals(g.get('s3'), undefined);
});

Deno.test('planning still feeds the key collection end to end', () => {
  const planned = planInventoryMovements(
    [
      { id: 'l1', product_id: 'p', qty: 2, status: 'entregado' },
      { id: 'l2', product_id: 'p', qty: 1, status: 'cancelado', prepared: true },
    ],
    { p: { track_inventory: true, inventory_item_id: 's1', inventory_qty: 1 } },
  );
  assertEquals(collectMovementKeys(planned).sort(), ['merma:l2', 'venta:l1', 'venta:l2']);
});

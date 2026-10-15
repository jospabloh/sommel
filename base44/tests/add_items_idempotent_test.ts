// orders.addItems idempotency, shift corte $0 payments and cancelOrder with a
// fixed tip (2026-10-15). Zero external imports.
import {
  LogicError,
  validateBatchKey,
  batchLineKeys,
  addLinesIdempotent,
} from '../functions/orders/handlers/_logic.ts';
import { salesByMethod } from '../functions/shifts/handlers/_logic.ts';
import { computeOrderTotals, pickSurvivor } from '../../scripts/templates/_guard_logic.ts';
// @ts-ignore: plain JS module shared with the client bundle
import { reuseBatchKey } from '../../src/components/orders/helpers.js';
// @ts-ignore: plain JS module shared with the client bundle
import { isRetryable } from '../../src/lib/retryPolicy.js';

function eq(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`);
}

/** In-memory OrderItem table with the same surface addItems uses. */
function fakeStore(opts: { failAfterCreates?: number; twin?: boolean } = {}) {
  const rows: any[] = [];
  let seq = 0;
  let creates = 0;
  const mk = (line: any, key: string | null) => {
    const row = { id: `r${++seq}`, created_date: `2026-10-15T00:00:0${seq}Z`, status: 'nuevo', ...line, ...(key ? { idempotency_key: key } : {}) };
    rows.push(row);
    return row;
  };
  return {
    rows,
    find: async (keys: string[]) => rows.filter((r) => keys.includes(r.idempotency_key)),
    create: async (line: any, key: string | null) => {
      const row = mk(line, key);
      creates++;
      // A twin request landed the same key between our read and our write.
      if (opts.twin && key) mk(line, key);
      if (opts.failAfterCreates && creates === opts.failAfterCreates) throw new Error('429 after the writes');
      return row;
    },
    neutralize: async (row: any) => { row.status = 'cancelado'; row.cancel_reason = 'duplicado'; },
  };
}

const lines = [{ name: 'a' }, { name: 'b' }, { name: 'c' }];
const live = (rows: any[]) => rows.filter((r) => r.status !== 'cancelado');

Deno.test('addItems: a retry after a 429 that DID write does not double the lines', async () => {
  const store = fakeStore({ failAfterCreates: 3 });
  const keys = batchLineKeys('abcdefgh-1', 3);
  const args = { keys, lines, find: store.find, create: store.create, neutralize: store.neutralize, pick: pickSurvivor };
  let failed = false;
  try { await addLinesIdempotent(args); } catch { failed = true; }
  eq(failed, true);
  eq(store.rows.length, 3);
  const again = await addLinesIdempotent(args);
  eq(store.rows.length, 3); // nothing created the second time
  eq(again.idempotent, true);
  eq(again.rows.map((r) => r.name), ['a', 'b', 'c']);
});

Deno.test('addItems: a partial first attempt only creates the missing lines', async () => {
  const store = fakeStore();
  const keys = batchLineKeys('abcdefgh-2', 3);
  await store.create(lines[0], keys[0]);
  const res = await addLinesIdempotent({ keys, lines, find: store.find, create: store.create, neutralize: store.neutralize, pick: pickSurvivor });
  eq(store.rows.length, 3);
  eq(res.idempotent, false);
  eq(res.rows.length, 3);
});

Deno.test('addItems: two requests at once leave one live row per key', async () => {
  const store = fakeStore({ twin: true });
  const keys = batchLineKeys('abcdefgh-3', 3);
  const res = await addLinesIdempotent({ keys, lines, find: store.find, create: store.create, neutralize: store.neutralize, pick: pickSurvivor });
  eq(store.rows.length, 6);
  eq(live(store.rows).length, 3); // duplicates cancelled, never deleted
  eq(res.rows.every((r) => r.status !== 'cancelado'), true);
  eq(store.rows.filter((r) => r.status === 'cancelado').every((r) => r.cancel_reason === 'duplicado'), true);
});

Deno.test('addItems: without batch_key the behavior is the old one', async () => {
  const store = fakeStore();
  const args = { keys: null, lines, find: store.find, create: store.create, neutralize: store.neutralize, pick: pickSurvivor };
  await addLinesIdempotent(args);
  await addLinesIdempotent(args);
  eq(store.rows.length, 6);
  eq(store.rows.some((r) => 'idempotency_key' in r), false);
});

Deno.test('batch_key validation and client key reuse', () => {
  eq(validateBatchKey(undefined), null);
  eq(validateBatchKey('3f1c2b4a-aaaa-bbbb-cccc-1234567890ab'), '3f1c2b4a-aaaa-bbbb-cccc-1234567890ab');
  for (const bad of ['short', 'has:colon-12345', 7, 'x'.repeat(65)]) {
    let code = 'none';
    try { validateBatchKey(bad); } catch (e) { code = e instanceof LogicError ? e.code : 'other'; }
    eq(code, 'invalid_batch_key');
  }
  let n = 0;
  const make = () => `key-${++n}-padding`;
  const first = reuseBatchKey(null, { qty: 1 }, make);
  eq(reuseBatchKey(first, { qty: 1 }, make).key, first.key); // same retry, same key
  eq(reuseBatchKey(first, { qty: 2 }, make).key === first.key, false); // changed sheet, new key
  eq(reuseBatchKey(null, { qty: 1 }, make).key === first.key, false); // finished attempt, new key
});

Deno.test('addItems is retried after a 429 only because every call carries batch_key', () => {
  eq(isRetryable('orders', 'addItems'), true);
  eq(isRetryable('orders', 'updateItem'), false);
});

Deno.test('corte: a $0 closing payment is not a payment', () => {
  const methods = [{ key: 'efectivo', label: 'Efectivo', is_cash: true }];
  const out = salesByMethod(
    [
      { method: 'efectivo', amount: 0 },
      { method: 'efectivo', amount: 5000 },
      { method: 'tarjeta', amount: 0 },
    ] as any,
    methods as any
  );
  eq(out.map((m) => [m.key, m.count, m.amount]), [['efectivo', 1, 5000]]);
  eq(salesByMethod([{ method: 'efectivo', amount: 0 }] as any, methods as any), []);
});

Deno.test('cancelOrder: a fixed tip does not survive on a cancelled order', () => {
  const lineless = [{ status: 'cancelado', unit_price: 1000, qty: 2 }];
  const order = { tip: 500, tip_pct: null };
  // The handler passes the order with tip 0 and tip_pct null.
  const totals = computeOrderTotals(lineless, { ...order, tip: 0, tip_pct: null });
  eq(totals.total, 0);
  eq(computeOrderTotals(lineless, order).total > 0, true); // what it used to do
});

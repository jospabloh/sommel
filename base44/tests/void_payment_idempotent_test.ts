// payments.voidPayment must be repeatable (2026-10-15): a 429 between voiding
// the Payment and updating the Order left a `cobrada` order nobody could
// reopen. Also: the stock recompute must count movements it just wrote.
//   deno test --allow-env base44/tests/void_payment_idempotent_test.ts
import { paidTotal, reopenAfterVoid, stockFromMovements, withJustCreated } from '../functions/payments/handlers/_logic.ts';
import { isRetryable } from '../../src/lib/retryPolicy.js';

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg ?? 'assertEquals'}: expected ${e}, got ${a}`);
}

const voided = '2026-10-15T01:00:00Z';

Deno.test('the stuck order from production reopens: cobrada, 19500 paid, its payment voided', () => {
  const order = { status: 'cobrada', total: 19500 };
  const live = [{ amount: 19500, voided_at: voided }];
  assertEquals(paidTotal(live), 0);
  assertEquals(reopenAfterVoid(order, { voided_by: 'ana@bar.mx' }, live), true);
});

Deno.test('a partly covered order reopens, a still covered one does not', () => {
  const order = { status: 'cobrada', total: 20000 };
  const gone = { voided_by: 'ana@bar.mx' };
  assertEquals(reopenAfterVoid(order, gone, [{ amount: 10000 }, { amount: 10000, voided_at: voided }]), true);
  assertEquals(reopenAfterVoid(order, gone, [{ amount: 20000 }, { amount: 5000, voided_at: voided }]), false);
});

Deno.test('an order that is already open or cancelled is never reopened', () => {
  const gone = { voided_by: 'ana@bar.mx' };
  assertEquals(reopenAfterVoid({ status: 'abierta', total: 100 }, gone, []), false);
  assertEquals(reopenAfterVoid({ status: 'cancelada', total: 100 }, gone, []), false);
});

Deno.test('a payment the system voided (duplicado) never reopens a paid order', () => {
  // The live twin covers the bill; repeating the void of the duplicate must not undo the sale.
  const order = { status: 'cobrada', total: 5000 };
  assertEquals(reopenAfterVoid(order, { voided_by: 'sistema' }, [{ amount: 5000 }]), false);
  assertEquals(reopenAfterVoid({ status: 'cobrada', total: 0 }, { voided_by: 'sistema' }, [{ amount: 0 }]), false);
});

Deno.test('a cortesia (total 0) reopens only when no live payment is left', () => {
  const gone = { voided_by: 'ana@bar.mx' };
  assertEquals(reopenAfterVoid({ status: 'cobrada', total: 0 }, gone, [{ amount: 0, voided_at: voided }]), true);
  assertEquals(reopenAfterVoid({ status: 'cobrada', total: 0 }, gone, [{ amount: 0 }, { amount: 0, voided_at: voided }]), false);
});

Deno.test('voidPayment is retried after a 429 only because the server made it idempotent', () => {
  assertEquals(isRetryable('payments', 'voidPayment'), true);
  assertEquals(isRetryable('payments', 'applyDiscount'), false);
});

Deno.test('stock counts a movement this call wrote even if the read missed it', () => {
  // $0 close: the venta row was created but the recompute read did not return it yet.
  const created = [{ item_id: 'i1', idempotency_key: 'venta:a', qty: -3 }];
  const read = [{ item_id: 'i1', idempotency_key: 'compra:1', qty: 10 }];
  assertEquals(stockFromMovements(read), 10, 'without the fix the stock stayed 10');
  assertEquals(stockFromMovements(withJustCreated(read, created)), 7);
  // Read already has it: counted once.
  assertEquals(stockFromMovements(withJustCreated([...read, ...created], created)), 7);
});

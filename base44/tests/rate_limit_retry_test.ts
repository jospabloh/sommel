// Base44's rate limit inside a function and in the client (2026-10-14).
// José: a 429 in the middle of a cobro "no puede seguir pasando". These tests
// pin why the retries are safe, not only that they happen.
import {
  ENTITY_RETRY_BUDGET_MS,
  entityRetryDelay,
  newRetryBudget,
  retryOnRateLimit,
  retryingEntities,
} from '../../scripts/templates/_guard_logic.ts';
// @ts-ignore: plain JS module shared with the client bundle
import { IDEMPOTENT_WRITES, isRetryable } from '../../src/lib/retryPolicy.js';

function assert(cond: unknown, msg = 'assert'): asserts cond {
  if (!cond) throw new Error(msg);
}
function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg ?? 'assertEquals'}: expected ${e}, got ${a}`);
}
async function assertRejects(fn: () => Promise<unknown>) {
  try { await fn(); } catch { return; }
  throw new Error('expected a rejection');
}

const rateLimit = () => Object.assign(new Error('Rate limit exceeded'), { status: 429 });
const noSleep = () => Promise.resolve();
const opts = () => ({ budget: newRetryBudget(), sleep: noSleep, random: () => 0 });

Deno.test('a refused operation is repeated and the action goes through', async () => {
  let calls = 0;
  const out = await retryOnRateLimit('Payment.create', async () => {
    calls++;
    if (calls < 3) throw rateLimit();
    return 'ok';
  }, opts());
  assertEquals(out, 'ok');
  assertEquals(calls, 3);
});

Deno.test('any other error is not retried: a real failure must not run twice', async () => {
  let calls = 0;
  await assertRejects(() => retryOnRateLimit('Order.update', async () => {
    calls++;
    throw new Error('validation failed');
  }, opts()));
  assertEquals(calls, 1);
});

Deno.test('the waits are capped per request, so an exhausted quota is not hammered', async () => {
  const budget = newRetryBudget();
  let calls = 0;
  const o = { budget, sleep: noSleep, random: () => 0 };
  // Every operation of the request keeps failing: retries stop once the
  // shared budget is spent, across operations.
  for (let i = 0; i < 5; i++) {
    await assertRejects(() => retryOnRateLimit(`op${i}`, async () => { calls++; throw rateLimit(); }, o));
  }
  assert(budget.spentMs <= ENTITY_RETRY_BUDGET_MS);
  assert(calls < 5 * 4, `retried ${calls} times`);
  assertEquals(entityRetryDelay(0, { spentMs: ENTITY_RETRY_BUDGET_MS, budgetMs: ENTITY_RETRY_BUDGET_MS }), null);
});

Deno.test('entity methods are retried; non-promise methods (subscribe) pass through', async () => {
  let creates = 0;
  const raw = {
    Payment: {
      create(row: unknown) {
        creates++;
        return creates === 1 ? Promise.reject(rateLimit()) : Promise.resolve({ id: 'p1', row });
      },
      subscribe() { return 'unsub'; },
    },
  };
  const ents = retryingEntities(raw, opts());
  const made = await ents.Payment.create({ amount: 100 });
  assertEquals(made.id, 'p1');
  assertEquals(creates, 2);
  assertEquals(ents.Payment.subscribe(), 'unsub');
});

Deno.test('client retries only writes the server makes idempotent', () => {
  // addPayment answers a repeated idempotency_key with its own payment;
  // requestTicket dedupes by order/paid/total; marking a marked job is a no-op.
  assert(isRetryable('payments', 'addPayment'));
  assert(isRetryable('payments', 'requestTicket'));
  assert(isRetryable('printing', 'markPrinted'));
  assert(isRetryable('printing', 'markFailed'));
  // No such guarantee: repeating these could do the work twice.
  assert(!isRetryable('payments', 'applyDiscount'));
  // voidPayment (2026-10-15): a repeat finishes the order side, it never voids another payment.
  assert(isRetryable('payments', 'voidPayment'));
  assert(!isRetryable('orders', 'updateItem'));
  // addItems is idempotent per batch_key (the client always sends one).
  assert(isRetryable('orders', 'addItems'));
  assert(!isRetryable('printing', 'claimNext'));
  assert(!isRetryable('shifts', 'close'));
  assertEquals(Object.keys(IDEMPOTENT_WRITES).sort(), ['orders', 'payments', 'printing']);
});

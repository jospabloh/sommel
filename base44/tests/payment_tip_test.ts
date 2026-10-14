// Tip per payment when the bill is split (José, 2026-10-13: "que las propinas
// se puedan aplicar individualmente"). Each payer leaves their own tip, the
// order's tip is the sum of them, and nothing else (corte, reports, "falta")
// had to change. Each test says what would go wrong for the bar.
//   deno test --allow-env base44/tests/payment_tip_test.ts
import {
  LogicError,
  billTotalForSplit,
  canTipPerPayment,
  paymentTips,
  planPaymentTip,
  remainingOf,
  splitByItems,
} from '../functions/payments/handlers/_logic.ts';
import { computeOrderTotals } from '../../scripts/templates/_guard_logic.ts';

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg ?? 'assertEquals'}: expected ${e}, got ${a}`);
}

function assertCode(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (err) {
    if (err instanceof LogicError && err.code === code) return;
    throw new Error(`expected ${code}, got ${(err as Error).message}`);
  }
  throw new Error(`expected ${code}, nothing thrown`);
}

Deno.test('a percentage tip is over THIS payer\'s share, not the whole bill', () => {
  assertEquals(planPaymentTip({ pct: 10 }, 50000), 5000, '10 % of $500 is $50, not 10 % of the table');
  assertEquals(planPaymentTip({ amount: 2000 }, 50000), 2000);
  assertEquals(planPaymentTip(undefined, 50000), 0, 'no tip chosen: nothing added');
});

Deno.test('a bad tip is refused instead of charging something odd', () => {
  assertCode(() => planPaymentTip({ pct: 150 }, 50000), 'invalid_pct');
  assertCode(() => planPaymentTip({ amount: -1 }, 50000), 'invalid_amount');
  assertCode(() => planPaymentTip({ pct: 10, amount: 100 }, 50000), 'invalid_tip');
  assertCode(() => planPaymentTip('10', 50000), 'invalid_tip');
});

Deno.test('the order tip is the sum of live payment tips; a voided payment takes its tip with it', () => {
  const payments = [
    { amount: 55000, tip: 5000 },
    { amount: 52000, tip: 2000, voided_at: '2026-10-13T20:00:00Z' },
    { amount: 50000 },
  ];
  assertEquals(paymentTips(payments), 5000);
});

Deno.test('two payers, two tips: the bill still closes exactly', () => {
  // $1,000 bill, two halves. A tips 10 %, B tips $30.
  const items = [{ status: 'enviado', unit_price: 100000, qty: 1 }];
  const tipA = planPaymentTip({ pct: 10 }, 50000);
  const afterA = computeOrderTotals(items, { tip: tipA });
  const paidA = [{ amount: 50000 + tipA, tip: tipA }];
  assertEquals(remainingOf(afterA.total, paidA), 50000, 'A\'s tip does not reduce what B owes');
  const tipB = planPaymentTip({ amount: 3000 }, 50000);
  const paid = [...paidA, { amount: 50000 + tipB, tip: tipB }];
  const final = computeOrderTotals(items, { tip: paymentTips(paid) });
  assertEquals(final.tip, 8000, 'corte reports $80 of tips');
  assertEquals(remainingOf(final.total, paid), 0, 'nothing left owed, nothing overpaid');
});

Deno.test('an order-wide tip blocks per-payment tips (it would be charged twice)', () => {
  assertEquals(canTipPerPayment({ tip_pct: 10, tip: 0 }, []), false, 'a percentage tip is already in every share');
  assertEquals(canTipPerPayment({ tip_pct: null, tip: 5000 }, []), false, 'a fixed tip set before paying');
  assertEquals(canTipPerPayment({ tip_pct: null, tip: 0 }, []), true);
  assertEquals(canTipPerPayment({ tip_pct: null, tip: 5000 }, [{ tip: 5000 }]), true, 'the tip came from a payment');
});

Deno.test('split by dishes does not hand an earlier payer\'s tip to the next one', () => {
  // $1,000 bill. A paid $500 + $50 tip; order total is now $1,050.
  const order = { subtotal: 100000, total: 105000 };
  const payments = [{ amount: 55000, tip: 5000 }];
  const items = [
    { id: 'a', status: 'enviado', unit_price: 50000, qty: 1 },
    { id: 'b', status: 'enviado', unit_price: 40000, qty: 1 },
    { id: 'c', status: 'enviado', unit_price: 10000, qty: 1 },
  ];
  const remaining = remainingOf(order.total, payments);
  const share = splitByItems(items, ['b'], { subtotal: order.subtotal, total: billTotalForSplit(order, payments) }, remaining);
  assertEquals(share, 40000, 'B ordered $400 and owes $400, not $420');
});

// @ts-ignore: plain JS module shared with the client bundle
import { canTipThisPayment } from '../../src/lib/paymentTipRule.js';

Deno.test('a payer charged again after a void can still leave their own tip', () => {
  // José, 2026-10-14: one part of a split bill was voided and charged again;
  // the panel reopens on "cuenta completa", where the order-wide tip button
  // is locked by the payment that stayed. Without this the last payer could
  // not tip without cancelling the whole bill.
  const order = { tip: 2550, tip_pct: null };
  const live = [{ tip: 2550 }];
  if (!canTipThisPayment({ mode: 'full', order, livePayments: live })) throw new Error('full mode after a payment must allow a tip');
  // With no payment yet, "cuenta completa" uses the order-wide tip instead.
  if (canTipThisPayment({ mode: 'full', order: { tip: 0 }, livePayments: [] })) throw new Error('full mode with no payments uses the general tip');
  // An order-wide tip is already prorated: a second tip would double charge.
  if (canTipThisPayment({ mode: 'equal', order: { tip: 5100, tip_pct: 10 }, livePayments: [] })) throw new Error('tip_pct blocks it');
  if (canTipThisPayment({ mode: 'full', order: { tip: 5100 }, livePayments: [{ tip: 0 }] })) throw new Error('fixed order tip blocks it');
  // Same rule as the server, so the panel never offers what addPayment refuses.
  for (const [o, p] of [[order, live], [{ tip: 5100 }, [{ tip: 0 }]], [{ tip: 0, tip_pct: 10 }, []]] as const) {
    if (canTipThisPayment({ mode: 'items', order: o, livePayments: p }) !== canTipPerPayment(o as any, p as any)) {
      throw new Error('client and server disagree');
    }
  }
});

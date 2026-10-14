// When the cobro panel offers a tip for THIS payment. No imports: tested in
// Deno (base44/tests/payment_tip_test.ts).
//
// - Split modes (equal, by dishes): always, as long as the order has no
//   order-wide tip (that one is already prorated into every share).
// - "Cuenta completa": only once the bill already has live payments. Then
//   the order-wide tip button is locked, and this is the only way the last
//   payer can leave a tip; e.g. after voiding one part of a split bill and
//   charging it again (José, 2026-10-14). The server rule is the same
//   (canTipPerPayment): it never looks at the mode.
export function canTipThisPayment({ mode, order, livePayments }) {
  const payments = livePayments ?? [];
  if (mode === 'full' && payments.length === 0) return false;
  if (order?.tip_pct != null) return false;
  const tips = payments.reduce((sum, p) => sum + (typeof p.tip === 'number' && p.tip > 0 ? p.tip : 0), 0);
  return (order?.tip ?? 0) === tips;
}

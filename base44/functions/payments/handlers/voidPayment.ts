// payments.voidPayment — entrega-2-contratos.md §5. Only while the payment's
// own shift is still open; a `cobrada` order goes back to `abierta`.
import { loadOwned, requirePermission, requireWritable, httpError, type Ctx, type Route } from '../_guard.ts';
import { validateReason, paidTotal, paymentTips, reopenAfterVoid } from './_logic.ts';
import { assertTablesFree, loadPayments, rethrow, setTablesStatus, writeTotals } from './_shared.ts';
import { recordApproval, requireApproval } from '../_approval.ts';

export const voidPayment: Route = async (ctx: Ctx, body: any) => {
  const payment = await loadOwned(ctx, 'Payment', body?.payment_id);
  const order = await loadOwned(ctx, 'Order', payment.order_id);
  await requirePermission(ctx, 'Cobro:anular_pago');
  requireWritable(ctx);

  let reason: string;
  try {
    reason = validateReason(body?.reason);
  } catch (err) {
    rethrow(err);
  }

  // Idempotent (2026-10-15): the void is several writes, and a 429 between the
  // Payment and the Order left a voided payment on a `cobrada` order with no
  // way out (the repeat answered 409). An already voided payment now finishes
  // the effect from the LIVE payments instead. It asks for no manager approval
  // again: that approval was spent on the first attempt, and completing an
  // effect already approved is not a new action. It cannot void anything, so
  // a repeat can never touch a different payment.
  if (payment.voided_at) return await finishVoid(ctx, order, payment);

  const [shift] = payment.shift_id ? await ctx.svc.entities.Shift.filter({ id: payment.shift_id }) : [];
  if (!shift || shift.closed_at) {
    httpError(409, 'shift_closed', 'El turno de este pago ya se cerró; no se puede anular');
  }

  const reopening = order.status === 'cobrada';
  if (order.status === 'cancelada') httpError(409, 'order_closed', 'Esta comanda fue cancelada');
  if (reopening) {
    // The tables were freed on close; refuse if another order took one.
    await assertTablesFree(ctx, order);
  }

  // Manager approval, after every validation (see orders.cancelItem).
  const approval = await requireApproval(ctx, body, 'void_payment');

  const now = new Date().toISOString();
  const voided = await ctx.svc.entities.Payment.update(payment.id, {
    voided_at: now,
    voided_by: ctx.user?.email,
    void_reason: reason,
  });

  const live = await loadPayments(ctx, order.id);
  const paid = paidTotal(live);
  // A voided payment takes its own tip with it (tip per payment, 2026-10-13).
  let base = order;
  if ((payment.tip ?? 0) > 0) base = await writeTotals(ctx, order, { tip_pct: null, tip: paymentTips(live) });
  let updated;
  if (reopening) {
    updated = await ctx.svc.entities.Order.update(base.id, {
      status: 'abierta',
      closed_at: null,
      closed_by: '',
      paid,
    });
    await setTablesStatus(ctx, order, 'occupied');
  } else {
    updated = await ctx.svc.entities.Order.update(base.id, { paid });
  }

  await recordApproval(ctx, approval, { targetId: payment.id, detail: reason });
  return { payment: voided, order: updated };
};

/** Completes the order side of a payment that is already voided; safe to repeat. */
async function finishVoid(ctx: Ctx, order: any, payment: any) {
  if (order.status === 'cancelada') httpError(409, 'order_closed', 'Esta comanda fue cancelada');
  const live = await loadPayments(ctx, order.id);
  const paid = paidTotal(live);
  let base = order;
  if ((payment.tip ?? 0) > 0 && (order.tip ?? 0) !== paymentTips(live)) {
    base = await writeTotals(ctx, order, { tip_pct: null, tip: paymentTips(live) });
  }
  let updated = base;
  if (reopenAfterVoid(base, payment, live)) {
    await assertTablesFree(ctx, order);
    updated = await ctx.svc.entities.Order.update(base.id, { status: 'abierta', closed_at: null, closed_by: '', paid });
    await setTablesStatus(ctx, order, 'occupied');
  } else if ((base.paid ?? 0) !== paid) {
    updated = await ctx.svc.entities.Order.update(base.id, { paid });
  }
  return { payment, order: updated, idempotent: true };
}

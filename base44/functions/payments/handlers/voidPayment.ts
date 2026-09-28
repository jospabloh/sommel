// payments.voidPayment — entrega-2-contratos.md §5. Only while the payment's
// own shift is still open; a `cobrada` order goes back to `abierta`.
import { loadOwned, requirePermission, requireWritable, httpError, type Ctx, type Route } from '../_guard.ts';
import { validateReason, paidTotal } from './_logic.ts';
import { loadPayments, rethrow, setTablesStatus } from './_shared.ts';

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

  if (payment.voided_at) httpError(409, 'already_voided', 'Este pago ya está anulado');

  const [shift] = payment.shift_id ? await ctx.svc.entities.Shift.filter({ id: payment.shift_id }) : [];
  if (!shift || shift.closed_at) {
    httpError(409, 'shift_closed', 'El turno de este pago ya se cerró; no se puede anular');
  }

  const reopening = order.status === 'cobrada';
  if (order.status === 'cancelada') httpError(409, 'order_closed', 'Esta comanda fue cancelada');
  if (reopening) {
    // The tables were freed on close; refuse if another order took one.
    for (const tableId of order.table_ids ?? []) {
      const [t] = await ctx.svc.entities.BarTable.filter({ id: tableId });
      if (t?.status === 'occupied') {
        httpError(409, 'table_busy', 'La mesa ya tiene otra comanda. Libérala antes de anular este pago.');
      }
    }
  }

  const now = new Date().toISOString();
  const voided = await ctx.svc.entities.Payment.update(payment.id, {
    voided_at: now,
    voided_by: ctx.user?.email,
    void_reason: reason,
  });

  const paid = paidTotal(await loadPayments(ctx, order.id));
  let updated;
  if (reopening) {
    updated = await ctx.svc.entities.Order.update(order.id, {
      status: 'abierta',
      closed_at: null,
      closed_by: '',
      paid,
    });
    await setTablesStatus(ctx, order, 'occupied');
  } else {
    updated = await ctx.svc.entities.Order.update(order.id, { paid });
  }

  return { payment: voided, order: updated };
};

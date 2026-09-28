// orders.cancelOrder — entrega-1-contratos.md §4 "orders". "solo sin pagos"
// (plan-tecnico.md §5) — Entrega 1 has no `payments` endpoint yet, but the
// `Payment` entity already exists in the schema, so this checks for any row
// rather than assuming the table is always empty.
import { loadOwned, requirePermission, requireWritable, httpError, HttpError, type Ctx, type Route } from '../_guard.ts';
import { LogicError, validateReason, isOrderOpen } from './_logic.ts';

export const cancelOrder: Route = async (ctx: Ctx, body: any) => {
  const order = await loadOwned(ctx, 'Order', body?.order_id);

  await requirePermission(ctx, 'Comandas:cancelar_orden');
  requireWritable(ctx);

  let reason: string;
  try {
    reason = validateReason(body?.reason);
  } catch (err) {
    if (err instanceof LogicError) throw new HttpError(400, err.code, err.message);
    throw err;
  }

  if (!isOrderOpen(order.status)) {
    httpError(409, 'order_closed', 'Esta comanda ya no está abierta');
  }

  const payments = await ctx.svc.entities.Payment.filter({ order_id: order.id });
  if (payments.length > 0) {
    httpError(409, 'has_payments', 'No se puede cancelar una comanda con pagos registrados');
  }

  const now = new Date().toISOString();

  const items = await ctx.svc.entities.OrderItem.filter({ order_id: order.id });
  for (const item of items) {
    if (item.status === 'cancelado') continue;
    // Only 'listo'/'entregado' lines were actually prepared (fixed
    // 2026-09-28): canCancelItem also returns true for 'enviado' (just sent,
    // never touched by the kitchen/bar), which used to be miscounted as
    // prepared here and would overstate merma once Entrega 2 reads
    // `prepared` for waste reporting.
    const wasPrepared = item.status === 'listo' || item.status === 'entregado';
    await ctx.svc.entities.OrderItem.update(item.id, {
      status: 'cancelado',
      cancel_reason: reason,
      prepared: wasPrepared,
    });
  }

  // Free every table this order held, regardless of `type` (fixed
  // 2026-09-28). moveTable/mergeOrders can attach a table to a 'llevar'
  // order without changing its `type`, so gating this on `type === 'mesa'`
  // left that table permanently 'occupied' with no open order pointing at
  // it — unusable until an admin deleted and recreated it.
  for (const tableId of order.table_ids ?? []) {
    await ctx.svc.entities.BarTable.update(tableId, { status: 'available' });
  }

  const updated = await ctx.svc.entities.Order.update(order.id, {
    status: 'cancelada',
    closed_at: now,
    cancel_reason: reason,
  });

  return { order: updated, reason };
};

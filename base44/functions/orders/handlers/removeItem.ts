// orders.removeItem — entrega-1-contratos.md §4 "orders". Only a 'nuevo'
// line can be removed outright (it never reached the kitchen/bar); once sent,
// the only way off is `cancelItem` (which keeps the row for audit).
import { loadOwned, requirePermission, requireWritable, httpError, type Ctx, type Route } from '../_guard.ts';
import { isOrderOpen, canEditItem } from './_logic.ts';
import { recomputeOrderTotals, assertTotalCoversPayments } from './_shared.ts';

export const removeItem: Route = async (ctx: Ctx, body: any) => {
  const item = await loadOwned(ctx, 'OrderItem', body?.item_id);
  const order = await loadOwned(ctx, 'Order', item.order_id);

  await requirePermission(ctx, 'Comandas:tomar');
  requireWritable(ctx);

  if (!isOrderOpen(order.status)) {
    httpError(409, 'order_closed', 'Esta comanda ya no está abierta');
  }
  if (!canEditItem(item.status)) {
    httpError(409, 'already_sent', 'Este renglón ya fue enviado a cocina/barra');
  }

  await assertTotalCoversPayments(ctx, order, item.id);
  await ctx.svc.entities.OrderItem.delete(item.id);
  await recomputeOrderTotals(ctx, order.id);

  return { ok: true };
};

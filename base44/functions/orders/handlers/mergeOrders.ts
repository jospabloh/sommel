// orders.mergeOrders — entrega-1-contratos.md §4 "orders". Moves every line
// from `from_order_id` into `into_order_id`, unions their table_ids, and
// cancels the origin order. Tenant is checked on BOTH orders (loadOwned on
// each), per the task's explicit instruction.
import { loadOwned, requirePermission, requireWritable, httpError, type Ctx, type Route } from '../_guard.ts';
import { isOrderOpen, mergeTableIds } from './_logic.ts';
import { recomputeOrderTotals } from './_shared.ts';

export const mergeOrders: Route = async (ctx: Ctx, body: any) => {
  const intoOrder = await loadOwned(ctx, 'Order', body?.into_order_id);
  const fromOrder = await loadOwned(ctx, 'Order', body?.from_order_id);

  await requirePermission(ctx, 'Comandas:mover_mesas');
  requireWritable(ctx);

  if (intoOrder.id === fromOrder.id) {
    httpError(400, 'same_order', 'No puedes unir una comanda consigo misma');
  }
  if (!isOrderOpen(intoOrder.data?.status) || !isOrderOpen(fromOrder.data?.status)) {
    httpError(409, 'order_closed', 'Ambas comandas deben estar abiertas para unirlas');
  }

  // Move every line — including already-cancelled ones — to keep the audit
  // trail intact under the surviving order.
  const fromItems = await ctx.svc.entities.OrderItem.filter({ order_id: fromOrder.id });
  for (const item of fromItems) {
    await ctx.svc.entities.OrderItem.update(item.id, { order_id: intoOrder.id });
  }

  const mergedTableIds = mergeTableIds(intoOrder.data?.table_ids, fromOrder.data?.table_ids);
  // Every table now covered by `intoOrder` stays/becomes occupied; the ones
  // that were exclusive to `fromOrder` are already 'occupied' and remain so
  // (they're still in use, just under the surviving order now).
  await ctx.svc.entities.Order.update(intoOrder.id, { table_ids: mergedTableIds });

  const now = new Date().toISOString();
  await ctx.svc.entities.Order.update(fromOrder.id, {
    status: 'cancelada',
    closed_at: now,
    table_ids: [],
  });

  await recomputeOrderTotals(ctx, intoOrder.id);
  const updated = await loadOwned(ctx, 'Order', intoOrder.id);

  return { order: updated };
};

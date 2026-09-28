// orders.moveTable — entrega-1-contratos.md §4 "orders". Moves a whole
// order from its current table(s) to a single new one. Tenant is checked on
// BOTH the order and the destination table (loadOwned on each), per the
// task's explicit instruction.
import { loadOwned, requirePermission, requireWritable, httpError, type Ctx, type Route } from '../_guard.ts';
import { isOrderOpen } from './_logic.ts';

export const moveTable: Route = async (ctx: Ctx, body: any) => {
  const order = await loadOwned(ctx, 'Order', body?.order_id);
  const toTableId = body?.to_table_id;
  if (!toTableId) httpError(400, 'table_required', 'La mesa destino es obligatoria');
  const toTable = await loadOwned(ctx, 'BarTable', toTableId);

  await requirePermission(ctx, 'Comandas:mover_mesas');
  requireWritable(ctx);

  if (!isOrderOpen(order.status)) {
    httpError(409, 'order_closed', 'Esta comanda ya no está abierta');
  }

  const currentTableIds: string[] = order.table_ids ?? [];
  if (currentTableIds.includes(toTableId)) {
    // Already there (e.g. a retried request) — idempotent no-op.
    return { order };
  }

  if (toTable.status === 'occupied') {
    // Same structured order_id as orders.open (fixed 2026-09-28), so the
    // client can offer to jump to the order actually occupying it.
    const openOrders = await ctx.svc.entities.Order.filter({ tenant_id: ctx.tenantId, status: 'abierta' });
    const existing = openOrders.find((o: any) => (o.table_ids ?? []).includes(toTableId));
    httpError(
      409,
      'table_busy',
      'Esa mesa ya tiene una comanda abierta',
      existing ? { order_id: existing.id } : undefined
    );
  }

  // Free every table this order previously held, occupy the new one.
  for (const oldTableId of currentTableIds) {
    await ctx.svc.entities.BarTable.update(oldTableId, { status: 'available' });
  }
  await ctx.svc.entities.BarTable.update(toTableId, { status: 'occupied' });

  const updated = await ctx.svc.entities.Order.update(order.id, { table_ids: [toTableId] });

  return { order: updated };
};

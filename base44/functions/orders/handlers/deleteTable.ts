// orders.deleteTable — entrega-1-contratos.md §4 "orders". 409 table_busy if
// it has an open order — checked against actual open Orders referencing it,
// not just BarTable.status, since status is server-maintained but this is
// the one place a stale status would otherwise let a table with a live
// order disappear.
import { loadOwned, requirePermission, requireWritable, httpError, type Ctx, type Route } from '../_guard.ts';

export const deleteTable: Route = async (ctx: Ctx, body: any) => {
  const table = await loadOwned(ctx, 'BarTable', body?.id);

  await requirePermission(ctx, 'Mesas:editar');
  requireWritable(ctx);

  const openOrders = await ctx.svc.entities.Order.filter({ tenant_id: ctx.tenantId, status: 'abierta' });
  const inUse = openOrders.some((o: any) => (o.data?.table_ids ?? []).includes(table.id));
  if (inUse) {
    httpError(409, 'table_busy', 'Esta mesa tiene una comanda abierta');
  }

  await ctx.svc.entities.BarTable.delete(table.id);

  return { ok: true };
};

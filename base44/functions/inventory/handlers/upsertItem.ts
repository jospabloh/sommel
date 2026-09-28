// inventory.upsertItem. `stock` is never accepted (it is recomputed from
// movements); `unit_cost` only with Menú:ver_costos and, when not sent or not
// allowed, the stored value is kept.
import { loadOwned, requirePermission, requireWritable, hasPermission, httpError, type Ctx, type Route } from '../_guard.ts';
import { applyUnitCost, normalizeItemFields, redactUnitCost } from './_logic.ts';
import { guardLogic } from './_shared.ts';

export const upsertItem: Route = async (ctx: Ctx, body: any) => {
  const isUpdate = typeof body?.id === 'string' && body.id.length > 0;
  const existing = isUpdate ? await loadOwned(ctx, 'InventoryItem', body.id) : null;

  await requirePermission(ctx, 'Inventario:editar');
  requireWritable(ctx);
  if (!existing && !ctx.tenantId) httpError(403, 'no_tenant', 'No perteneces a ningún bar');

  const canSeeCosts = await hasPermission(ctx, 'Menú:ver_costos');
  const fields = guardLogic(() => normalizeItemFields(body, existing));
  const unit_cost = guardLogic(() => applyUnitCost(body, canSeeCosts, existing?.unit_cost));

  let row: any;
  if (existing) {
    await ctx.svc.entities.InventoryItem.update(existing.id, { ...fields, unit_cost });
    [row] = await ctx.svc.entities.InventoryItem.filter({ id: existing.id });
  } else {
    row = await ctx.svc.entities.InventoryItem.create({
      tenant_id: ctx.tenantId,
      ...fields,
      stock: 0,
      unit_cost,
    });
  }
  return { item: redactUnitCost(row, canSeeCosts) };
};

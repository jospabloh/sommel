// inventory.movements -> { movements } of one item, newest first, cost redacted.
import { loadOwned, requirePermission, hasPermission, type Ctx, type Route } from '../_guard.ts';
import { clampLimit, redactUnitCost } from './_logic.ts';

export const movements: Route = async (ctx: Ctx, body: any) => {
  const item = await loadOwned(ctx, 'InventoryItem', body?.item_id);
  await requirePermission(ctx, 'Inventario:ver');

  const limit = clampLimit(body?.limit);
  const rows = await ctx.svc.entities.InventoryMovement.filter(
    { tenant_id: item.tenant_id, item_id: item.id },
    '-created_date',
    limit,
  );
  const canSeeCosts = await hasPermission(ctx, 'Menú:ver_costos');
  return { movements: rows.map((r: any) => redactUnitCost(r, canSeeCosts)) };
};

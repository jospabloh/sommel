// inventory.addEntry: stock in. `unit_cost` (with Menú:ver_costos) also
// becomes the item's current cost.
import { loadOwned, requirePermission, requireWritable, hasPermission, type Ctx, type Route } from '../_guard.ts';
import { applyUnitCost, normalizeOptionalReason, redactUnitCost, validateIdempotencyKey, validatePositiveQty } from './_logic.ts';
import { guardLogic, recordMovement } from './_shared.ts';

export const addEntry: Route = async (ctx: Ctx, body: any) => {
  const item = await loadOwned(ctx, 'InventoryItem', body?.item_id);
  await requirePermission(ctx, 'Inventario:editar');
  requireWritable(ctx);

  const qty = guardLogic(() => validatePositiveQty(body?.qty));
  const reason = guardLogic(() => normalizeOptionalReason(body?.reason));
  const key = guardLogic(() => validateIdempotencyKey(body?.idempotency_key));
  const canSeeCosts = await hasPermission(ctx, 'Menú:ver_costos');
  const unitCost = guardLogic(() => applyUnitCost(body, canSeeCosts, item.unit_cost));

  const result = await recordMovement(ctx, item, {
    type: 'entrada',
    qty,
    unit_cost: unitCost,
    reason,
    idempotency_key: key,
  });

  // A new cost applies only on the first (non-replayed) write of this key.
  let fresh = result.item;
  if (result.created && canSeeCosts && body?.unit_cost !== undefined && unitCost !== (item.unit_cost ?? null)) {
    await ctx.svc.entities.InventoryItem.update(item.id, { unit_cost: unitCost });
    fresh = { ...fresh, unit_cost: unitCost };
  }
  return {
    movement: redactUnitCost(result.movement, canSeeCosts),
    item: redactUnitCost(fresh, canSeeCosts),
  };
};

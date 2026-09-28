// inventory.count: physical count. Writes a `conteo` movement whose qty is
// counted minus the stock the movements currently add up to.
import { loadOwned, requirePermission, requireWritable, hasPermission, type Ctx, type Route } from '../_guard.ts';
import { countDelta, normalizeOptionalReason, redactUnitCost, validateCounted, validateIdempotencyKey } from './_logic.ts';
import { guardLogic, recordMovement } from './_shared.ts';

export const count: Route = async (ctx: Ctx, body: any) => {
  const item = await loadOwned(ctx, 'InventoryItem', body?.item_id);
  await requirePermission(ctx, 'Inventario:editar');
  requireWritable(ctx);

  const counted = guardLogic(() => validateCounted(body?.counted));
  const reason = guardLogic(() => normalizeOptionalReason(body?.reason));
  const key = guardLogic(() => validateIdempotencyKey(body?.idempotency_key));

  const result = await recordMovement(ctx, item, {
    type: 'conteo',
    qty: (stock) => countDelta(counted, stock),
    unit_cost: typeof item.unit_cost === 'number' ? item.unit_cost : null,
    reason,
    idempotency_key: key,
  });

  const canSeeCosts = await hasPermission(ctx, 'Menú:ver_costos');
  return {
    movement: redactUnitCost(result.movement, canSeeCosts),
    item: redactUnitCost(result.item, canSeeCosts),
  };
};

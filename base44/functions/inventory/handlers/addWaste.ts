// inventory.addWaste: negative movement with the current cost. Reason required.
import { loadOwned, requirePermission, requireWritable, hasPermission, type Ctx, type Route } from '../_guard.ts';
import { redactUnitCost, validateIdempotencyKey, validatePositiveQty, validateWasteReason } from './_logic.ts';
import { guardLogic, recordMovement } from './_shared.ts';

export const addWaste: Route = async (ctx: Ctx, body: any) => {
  const item = await loadOwned(ctx, 'InventoryItem', body?.item_id);
  await requirePermission(ctx, 'Inventario:merma');
  requireWritable(ctx);

  const qty = guardLogic(() => validatePositiveQty(body?.qty));
  const reason = guardLogic(() => validateWasteReason(body?.reason));
  const key = guardLogic(() => validateIdempotencyKey(body?.idempotency_key));

  const result = await recordMovement(ctx, item, {
    type: 'merma',
    qty: -qty,
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

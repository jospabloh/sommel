// payments.retryInventory — finishes the inventory deduction of a closed
// order when addPayment answered `inventory_warning` (2026-10-14: under
// Base44's rate limit only part of the movements were written and stock was
// not recomputed). Safe to repeat: every movement has its own idempotency key
// (`venta:<item>` / `merma:<item>`) and stock is recomputed from movements.
import { loadOwned, requirePermission, requireWritable, httpError, type Ctx, type Route } from '../_guard.ts';
import { deductInventory } from './_shared.ts';

export const retryInventory: Route = async (ctx: Ctx, body: any) => {
  const order = await loadOwned(ctx, 'Order', body?.order_id);
  await requirePermission(ctx, 'Cobro:cobrar');
  requireWritable(ctx);
  if (order.status !== 'cobrada') httpError(409, 'order_not_closed', 'Esta comanda todavía no está cobrada');
  const inventoryWarning = await deductInventory(ctx, order.id);
  return inventoryWarning ? { inventory_warning: inventoryWarning } : {};
};

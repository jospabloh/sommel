// Small impure helpers shared across `orders` handlers. Not import-free (it
// touches `Ctx`/`svc`), so it lives apart from `_logic.ts`, which `deno test`
// must be able to load with zero imports.
import type { Ctx } from '../_guard.ts';
import { computeOrderTotals } from './_logic.ts';

/**
 * Recomputes and writes `Order.subtotal`/`total` from ALL of that order's
 * `OrderItem` rows (contract §4: "Totales de la orden ... se recalculan en
 * el servidor tras cada cambio de renglones"). Called after every write that
 * can change which lines count or their quantities: addItems, updateItem,
 * removeItem, cancelItem, mergeOrders.
 */
export async function recomputeOrderTotals(ctx: Ctx, orderId: string): Promise<void> {
  const allItems = await ctx.svc.entities.OrderItem.filter({ order_id: orderId });
  const { subtotal, total } = computeOrderTotals(
    allItems.map((i: any) => ({ status: i.data?.status, unit_price: i.data?.unit_price ?? 0, qty: i.data?.qty ?? 0 }))
  );
  await ctx.svc.entities.Order.update(orderId, { subtotal, total });
}

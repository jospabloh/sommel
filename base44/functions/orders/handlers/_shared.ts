// Small impure helpers shared across `orders` handlers. Not import-free (it
// touches `Ctx`/`svc`), so it lives apart from `_logic.ts`, which `deno test`
// must be able to load with zero imports.
import { computeOrderTotals, activePaymentsTotal, httpError, type Ctx } from '../_guard.ts';

/**
 * Loads the order's lines and computes the totals the order WOULD have,
 * without writing. Keeps the order's discount and tip settings (Entrega 2,
 * contract §4): a percentage follows the new subtotal, a fixed amount stays
 * (capped at the subtotal), a cortesia always equals the subtotal.
 */
export async function previewOrderTotals(
  ctx: Ctx,
  order: any,
  ignoreItemId?: string,
  qtyOverride?: { id: string; qty: number }
) {
  const allItems = await ctx.svc.entities.OrderItem.filter({ order_id: order.id });
  const items = allItems
    .filter((i: any) => i.id !== ignoreItemId)
    .map((i: any) => ({ status: i.status, unit_price: i.unit_price ?? 0, qty: qtyOverride && qtyOverride.id === i.id ? qtyOverride.qty : i.qty ?? 0 }));
  return computeOrderTotals(items, {
    discount_kind: order.discount_kind,
    discount_pct: order.discount_pct,
    discount: order.discount,
    tip_pct: order.tip_pct,
    tip: order.tip,
  });
}

/**
 * Recomputes and writes `Order.subtotal`/`discount`/`tip`/`total` from ALL of
 * that order's `OrderItem` rows (contract §4: "Totales de la orden ... se
 * recalculan en el servidor tras cada cambio de renglones"). Called after
 * every write that can change which lines count or their quantities:
 * addItems, updateItem, removeItem, cancelItem, mergeOrders.
 */
export async function recomputeOrderTotals(ctx: Ctx, orderId: string): Promise<void> {
  const [order] = await ctx.svc.entities.Order.filter({ id: orderId });
  if (!order) return;
  const { subtotal, discount, tip, total } = await previewOrderTotals(ctx, order);
  await ctx.svc.entities.Order.update(orderId, { subtotal, discount, tip, total });
}

/**
 * Entrega 2 §4: cancelItem/removeItem answer 409 `paid_exceeds_total` when
 * dropping a line would leave the order total below what was already paid
 * (non-voided payments). Called BEFORE the write.
 */
export async function assertTotalCoversPayments(
  ctx: Ctx,
  order: any,
  droppedItemId?: string,
  qtyOverride?: { id: string; qty: number }
): Promise<void> {
  const payments = await ctx.svc.entities.Payment.filter({ order_id: order.id });
  const paid = activePaymentsTotal(payments);
  if (paid <= 0) return;
  const { total } = await previewOrderTotals(ctx, order, droppedItemId, qtyOverride);
  if (total < paid) {
    httpError(409, 'paid_exceeds_total', 'Ya se cobró más de lo que quedaría de la cuenta. Anula un pago primero.');
  }
}

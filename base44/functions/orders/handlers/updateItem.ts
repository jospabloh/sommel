// orders.updateItem — entrega-1-contratos.md §4 "orders".
// Only qty/modifiers/notes are editable, and only while the line is still
// 'nuevo' (not sent). Price/cost/variant stay frozen from addItems (D6) —
// updateItem never re-prices, it only lets the wait staff fix a typo before
// sending.
import { loadOwned, requirePermission, requireWritable, hasPermission, httpError, HttpError, redactItemCost, type Ctx, type Route } from '../_guard.ts';
import { LogicError, resolveModifiers, validateQty, isOrderOpen, canEditItem } from './_logic.ts';
import { recomputeOrderTotals, assertTotalCoversPayments } from './_shared.ts';

export const updateItem: Route = async (ctx: Ctx, body: any) => {
  const item = await loadOwned(ctx, 'OrderItem', body?.item_id);
  const order = await loadOwned(ctx, 'Order', item.order_id);

  await requirePermission(ctx, 'Comandas:tomar');
  requireWritable(ctx);

  if (!isOrderOpen(order.status)) {
    httpError(409, 'order_closed', 'Esta comanda ya no está abierta');
  }
  if (!canEditItem(item.status)) {
    httpError(409, 'already_sent', 'Este renglón ya fue enviado a cocina/barra');
  }

  const patch: Record<string, unknown> = {};

  if (body?.qty !== undefined) {
    try {
      patch.qty = validateQty(body.qty);
    } catch (err) {
      if (err instanceof LogicError) throw new HttpError(400, err.code, err.message);
      throw err;
    }
  }

  if (body?.modifiers !== undefined) {
    const product = await loadOwned(ctx, 'Product', item.product_id);
    try {
      patch.modifiers = resolveModifiers(product.modifiers, body.modifiers);
    } catch (err) {
      if (err instanceof LogicError) throw new HttpError(400, err.code, err.message);
      throw err;
    }
  }

  if (body?.notes !== undefined) {
    patch.notes = typeof body.notes === 'string' ? body.notes : '';
  }

  // Lowering a qty can drop the total under what was already paid (same
  // dead end as cancelItem/removeItem), so guard it before writing.
  if (typeof patch.qty === 'number' && patch.qty < (item.qty ?? 0)) {
    await assertTotalCoversPayments(ctx, order, undefined, { id: item.id, qty: patch.qty });
  }

  const updated = await ctx.svc.entities.OrderItem.update(item.id, patch);

  if (patch.qty !== undefined) {
    await recomputeOrderTotals(ctx, order.id);
  }

  const canSeeCosts = await hasPermission(ctx, 'Menú:ver_costos');
  return { item: redactItemCost(updated, canSeeCosts) };
};

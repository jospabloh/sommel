// Small impure helpers shared across `orders` handlers. Not import-free (it
// touches `Ctx`/`svc`), so it lives apart from `_logic.ts`, which `deno test`
// must be able to load with zero imports.
import { computeOrderTotals, activePaymentsTotal, httpError, HttpError, personName, type Ctx } from '../_guard.ts';
import { narrowByField, LogicError, negativeStockAllowed, stockNeeds, assertStockCovers } from './_logic.ts';
import { buildComandaLines, comandaDedupeKey, groupByStation } from './_comanda.ts';

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

/** "Mesa 4 + Mesa 5", or "Para llevar · Ana" (same wording as the ticket). */
export async function placeLabel(ctx: Ctx, order: any): Promise<string> {
  if (order?.type === 'llevar') return `Para llevar${order.customer_name ? ` · ${order.customer_name}` : ''}`;
  const ids: string[] = order?.table_ids ?? [];
  // One `$in` query for all tables (rows re-narrowed); one query per table if
  // the operator is rejected.
  let rows: any[] = [];
  if (ids.length > 0) {
    try {
      rows = narrowByField(await ctx.svc.entities.BarTable.filter({ id: { $in: ids } }), 'id', ids);
    } catch {
      for (const id of ids) {
        const [t] = await ctx.svc.entities.BarTable.filter({ id });
        if (t) rows.push(t);
      }
    }
  }
  const byId = new Map<string, any>(rows.map((t: any) => [t.id, t]));
  const names = ids.map((id) => byId.get(id)?.name).filter(Boolean);
  return names.join(' + ') || 'Mesa';
}

/**
 * Queues the printed comanda (or the cancel notice) when the bar turned on
 * `print_comandas` in Ajustes. Best effort: the lines are already sent or
 * cancelled, so a failure here never fails the action; it is reported back
 * as `print_warning` instead. One job per station, deduplicated by its lines.
 */
export async function queueComandas(ctx: Ctx, order: any, items: any[], mode: 'send' | 'cancel'): Promise<string | null> {
  if (ctx.bar?.print_comandas !== true || !items?.length) return null;
  try {
    const [place, by] = [await placeLabel(ctx, order), personName(ctx.self) || ctx.user?.email || ''];
    const when = new Date().toISOString();
    for (const [station, group] of groupByStation(items)) {
      const kind = mode === 'cancel' ? 'cambio' : station;
      const dedupeKey = comandaDedupeKey(order.id, kind, group);
      const existing = await ctx.svc.entities.PrintJob.filter({ tenant_id: ctx.tenantId, dedupe_key: dedupeKey });
      if (existing.length > 0) continue;
      await ctx.svc.entities.PrintJob.create({
        tenant_id: ctx.tenantId,
        // A cancel notice prints where that station prints: its kind is
        // 'cambio' and the station decides the title.
        kind,
        title: `${kind === 'cambio' ? 'Cambio' : station === 'cocina' ? 'Cocina' : 'Barra'} · ${place}`,
        lines: buildComandaLines({ kind, station, place, when, by, items: group }),
        source_id: order.id,
        dedupe_key: dedupeKey,
        status: 'pendiente',
        attempts: 0,
      });
    }
    return null;
  } catch {
    return 'La comanda no se pudo mandar a imprimir. Revísala en Impresión.';
  }
}

/**
 * Refuses (409 insufficient_stock) lines whose supply does not cover them,
 * unless the bar allows negative stock. One $in read for all the supplies,
 * and none at all when nothing tracks inventory.
 */
export async function assertStockForLines(
  ctx: Ctx,
  tenantId: string,
  lines: Array<{ product: any; variant?: string | null; qty: number }>
): Promise<void> {
  if (negativeStockAllowed(ctx.bar)) return;
  const needs = stockNeeds(lines);
  if (needs.size === 0) return;
  const ids = Array.from(needs.keys());
  let rows: any[];
  try {
    rows = await ctx.svc.entities.InventoryItem.filter({ id: { $in: ids } });
  } catch {
    rows = [];
    for (const id of ids) rows.push(...(await ctx.svc.entities.InventoryItem.filter({ id })));
  }
  const supplies = new Map<string, any>();
  for (const row of rows) {
    if (row && ids.includes(row.id) && row.tenant_id === tenantId) supplies.set(row.id, row);
  }
  try {
    assertStockCovers(needs, supplies);
  } catch (err) {
    if (err instanceof LogicError) throw new HttpError(409, err.code, err.message);
    throw err;
  }
}

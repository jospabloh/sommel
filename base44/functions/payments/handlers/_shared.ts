// Impure helpers shared by the `payments` handlers (touch Ctx / svc). The
// testable rules live in `_logic.ts`.
import {
  DEFAULT_PAYMENT_METHODS,
  computeOrderTotals,
  pickSurvivor,
  httpError,
  HttpError,
  type Ctx,
  type PaymentMethodDef,
} from '../_guard.ts';
import {
  LogicError,
  chunk,
  collectMovementKeys,
  duplicatesToNeutralize,
  groupByField,
  mermaCoveredBySale,
  narrowByField,
  planInventoryMovements,
  stockFromMovements,
  ventaKeyOf,
  type InvProduct,
} from './_logic.ts';

/** LogicError (import-free) -> HttpError 400, everything else untouched. */
export function rethrow(err: unknown): never {
  if (err instanceof LogicError) throw new HttpError(400, err.code, err.message);
  throw err;
}

/** The bar's payment methods, or the contract §0 default when it has none. */
export function barMethods(ctx: Ctx): PaymentMethodDef[] {
  const list = ctx.bar?.payment_methods;
  return Array.isArray(list) && list.length > 0 ? list : DEFAULT_PAYMENT_METHODS;
}

/** The single open shift of the bar (no `closed_at`), or null. */
export async function findOpenShift(ctx: Ctx): Promise<any | null> {
  // Oldest open shift, id tiebreak: the same rule as shifts/_shared.ts, since
  // shifts.open keeps the oldest when a double open slips through.
  const recent = await ctx.svc.entities.Shift.filter({ tenant_id: ctx.tenantId }, '-created_date', 20);
  const open = recent
    .filter((s: any) => !s.closed_at)
    .sort((a: any, b: any) => String(a.created_date).localeCompare(String(b.created_date)) || String(a.id).localeCompare(String(b.id)));
  return open[0] ?? null;
}

export async function loadItems(ctx: Ctx, orderId: string): Promise<any[]> {
  return await ctx.svc.entities.OrderItem.filter({ order_id: orderId });
}

export async function loadPayments(ctx: Ctx, orderId: string): Promise<any[]> {
  return await ctx.svc.entities.Payment.filter({ order_id: orderId });
}

export function assertOrderOpen(order: any): void {
  if (order.status !== 'abierta') httpError(409, 'order_closed', 'Esta comanda ya no está abierta');
}

/**
 * Re-derives subtotal/discount/tip/total from the lines and the order's own
 * discount and tip settings, writes them, and returns the fresh order.
 */
export async function writeTotals(ctx: Ctx, order: any, patch: Record<string, unknown>): Promise<any> {
  const items = await loadItems(ctx, order.id);
  const merged = { ...order, ...patch };
  const totals = computeOrderTotals(
    items.map((i: any) => ({ status: i.status, unit_price: i.unit_price ?? 0, qty: i.qty ?? 0 })),
    {
      discount_kind: merged.discount_kind,
      discount_pct: merged.discount_pct,
      discount: merged.discount,
      tip_pct: merged.tip_pct,
      tip: merged.tip,
    }
  );
  return await ctx.svc.entities.Order.update(order.id, { ...patch, ...totals });
}

export async function setTablesStatus(ctx: Ctx, order: any, status: 'available' | 'occupied'): Promise<void> {
  for (const tableId of order.table_ids ?? []) {
    await ctx.svc.entities.BarTable.update(tableId, { status });
  }
}

/**
 * Names of the given tables, in the given order, in ONE `$in` query (falls
 * back to one query per table if the operator is rejected; rows re-narrowed).
 */
async function tableNames(ctx: Ctx, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  let rows: any[];
  try {
    rows = narrowByField(await ctx.svc.entities.BarTable.filter({ id: { $in: ids } }), 'id', ids);
  } catch {
    rows = [];
    for (const id of ids) {
      const [t] = await ctx.svc.entities.BarTable.filter({ id });
      if (t) rows.push(t);
    }
  }
  const byId = new Map<string, any>(rows.map((t: any) => [t.id, t]));
  return ids.map((id) => byId.get(id)?.name).filter(Boolean);
}

/** Place label shared by the ticket and its queue title. */
export async function placeOf(ctx: Ctx, order: any): Promise<{ place: string; title: string }> {
  if (order.type === 'llevar') {
    const who = order.customer_name || '';
    return { place: `Para llevar${who ? ` · ${who}` : ''}`, title: `Ticket Para llevar${who ? ` · ${who}` : ''}` };
  }
  const names = await tableNames(ctx, order.table_ids ?? []);
  const label = names.join(' + ') || 'Mesa';
  return { place: label, title: `Ticket ${label}` };
}

/**
 * Neutralizes every payment sharing `key` except the survivor (oldest
 * created_date, id tiebreak): voided with reason 'duplicado', never deleted.
 * Returns the survivor.
 */
export async function reconcilePayments(ctx: Ctx, key: string): Promise<any | null> {
  const rows = await ctx.svc.entities.Payment.filter({ tenant_id: ctx.tenantId, idempotency_key: key });
  const survivor = pickSurvivor(rows);
  if (!survivor) return null;
  const now = new Date().toISOString();
  for (const row of rows) {
    if (row.id === survivor.id || row.voided_at) continue;
    await ctx.svc.entities.Payment.update(row.id, {
      voided_at: now,
      voided_by: 'sistema',
      void_reason: 'duplicado',
    });
  }
  return survivor;
}

/** Reads every row for a query (Base44 caps a single filter page). Mirrors inventory/_shared.ts. */
async function fetchAll(client: any, query: Record<string, unknown>): Promise<any[]> {
  const PAGE = 500;
  const out: any[] = [];
  for (let skip = 0; skip < 50_000; skip += PAGE) {
    const rows = await client.filter(query, 'created_date', PAGE, skip);
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

/**
 * Reads the rows whose `field` is in `ids` with `$in`, 100 ids per query
 * (Base44's limit is app-wide and counts operations, so this replaces one
 * query per id). The rows are re-narrowed in memory: a backend that ignored
 * the operator must never widen what the caller acts on. If a chunk's `$in`
 * query throws, that chunk falls back to one query per id (slower, still
 * correct); an id that fails even then is returned in `failed` so the caller
 * can count it instead of silently assuming "no rows".
 */
async function fetchIn(
  client: any,
  base: Record<string, unknown>,
  field: string,
  ids: string[]
): Promise<{ rows: any[]; failed: Set<string> }> {
  const rows: any[] = [];
  const failed = new Set<string>();
  for (const part of chunk(ids)) {
    try {
      rows.push(...narrowByField(await fetchAll(client, { ...base, [field]: { $in: part } }), field, part));
    } catch {
      for (const id of part) {
        try {
          rows.push(...narrowByField(await fetchAll(client, { ...base, [field]: id }), field, [id]));
        } catch {
          failed.add(id);
        }
      }
    }
  }
  return { rows, failed };
}

/**
 * Deducts inventory for a closed order: 'venta' per sold line and 'merma'
 * per cancelled line that was already prepared, idempotent by key. After the
 * writes, each touched supply's stock is recomputed as Σ qty of its
 * movements. Never throws: a failure is reported through the returned
 * warning so the payment is not rolled back (contract §5).
 *
 * Reads are batched with `$in` (2026-10-14): products, supplies, existing
 * movements, the post-write duplicate check and the stock recompute are one
 * query each instead of one per row. Writes are unchanged.
 */
export async function deductInventory(ctx: Ctx, orderId: string): Promise<string | null> {
  let failed = 0;
  try {
    const items = await loadItems(ctx, orderId);
    const productIds = Array.from(new Set(items.map((i: any) => i.product_id).filter(Boolean))) as string[];
    const products: Record<string, InvProduct | null> = {};
    const productRead = await fetchIn(ctx.svc.entities.Product, {}, 'id', productIds);
    // A product that could not be read at all must not look "not tracked".
    if (productRead.failed.size > 0) throw new Error('product_read_failed');
    for (const pid of productIds) products[pid] = productRead.rows.find((p: any) => p.id === pid) ?? null;
    const planned = planInventoryMovements(items, products);
    if (planned.length === 0) return null;

    const supplyIds = Array.from(new Set(planned.map((m) => m.inventory_item_id)));
    const supplyRead = await fetchIn(ctx.svc.entities.InventoryItem, {}, 'id', supplyIds);
    const supplies = new Map<string, any>(supplyRead.rows.map((s: any) => [s.id, s]));

    // Movements whose supply is missing, foreign or unreadable are counted as
    // failed and skipped, exactly as before.
    const valid = planned.filter((m) => {
      const supply = supplies.get(m.inventory_item_id);
      if (supplyRead.failed.has(m.inventory_item_id) || !supply || supply.tenant_id !== ctx.tenantId) {
        failed++;
        return false;
      }
      return true;
    });
    const touched = new Set<string>(valid.map((m) => m.inventory_item_id));

    // ONE read answers both "already deducted?" and "merma after a sale?".
    const existingRead = await fetchIn(
      ctx.svc.entities.InventoryMovement,
      { tenant_id: ctx.tenantId },
      'idempotency_key',
      collectMovementKeys(valid)
    );
    const byKey = groupByField(existingRead.rows, 'idempotency_key');

    const created: string[] = [];
    for (const m of valid) {
      try {
        // A key we could not check is a movement we cannot safely write.
        if (existingRead.failed.has(m.idempotency_key) || (m.type === 'merma' && existingRead.failed.has(ventaKeyOf(m)))) {
          failed++;
          continue;
        }
        // A line already deducted as 'venta' (order closed, reopened, then the
        // line was cancelled as prepared) must not be deducted again as merma.
        if (mermaCoveredBySale(m, byKey)) continue;
        if ((byKey.get(m.idempotency_key) ?? []).length > 0) continue;
        const supply = supplies.get(m.inventory_item_id);
        await ctx.svc.entities.InventoryMovement.create({
          tenant_id: ctx.tenantId,
          item_id: m.inventory_item_id,
          type: m.type,
          qty: m.qty,
          unit_cost: supply.unit_cost ?? null,
          reason: m.reason,
          order_item_id: m.order_item_id,
          idempotency_key: m.idempotency_key,
          created_by: ctx.user?.email,
        });
        created.push(m.idempotency_key);
      } catch {
        failed++;
      }
    }

    // Re-read once after writing: concurrent closers may have both created a key.
    if (created.length > 0) {
      const reread = await fetchIn(ctx.svc.entities.InventoryMovement, { tenant_id: ctx.tenantId }, 'idempotency_key', created);
      failed += reread.failed.size;
      for (const row of duplicatesToNeutralize(reread.rows, pickSurvivor)) {
        try {
          await ctx.svc.entities.InventoryMovement.update(row.id, { qty: 0, reason: 'duplicado' });
        } catch {
          failed++;
        }
      }
    }

    const stockRead = await fetchIn(ctx.svc.entities.InventoryMovement, { tenant_id: ctx.tenantId }, 'item_id', Array.from(touched));
    const byItem = groupByField(stockRead.rows, 'item_id');
    for (const itemId of touched) {
      try {
        if (stockRead.failed.has(itemId)) throw new Error('stock_read_failed');
        await ctx.svc.entities.InventoryItem.update(itemId, { stock: stockFromMovements(byItem.get(itemId) ?? []) });
      } catch {
        failed++;
      }
    }
  } catch {
    return 'No se pudo descontar el inventario. El cobro quedó registrado; revisa las existencias.';
  }
  return failed > 0
    ? 'Algunos movimientos de inventario no se pudieron registrar. El cobro quedó registrado; revisa las existencias.'
    : null;
}

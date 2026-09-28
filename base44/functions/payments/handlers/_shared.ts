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
import { LogicError, planInventoryMovements, stockFromMovements, type InvProduct } from './_logic.ts';

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

/** Place label shared by the ticket and its queue title. */
export async function placeOf(ctx: Ctx, order: any): Promise<{ place: string; title: string }> {
  if (order.type === 'llevar') {
    const who = order.customer_name || '';
    return { place: `Para llevar${who ? ` · ${who}` : ''}`, title: `Ticket Para llevar${who ? ` · ${who}` : ''}` };
  }
  const names: string[] = [];
  for (const id of order.table_ids ?? []) {
    const [t] = await ctx.svc.entities.BarTable.filter({ id });
    if (t?.name) names.push(t.name);
  }
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
 * Deducts inventory for a closed order: 'venta' per sold line and 'merma'
 * per cancelled line that was already prepared, idempotent by key. After the
 * writes, each touched supply's stock is recomputed as Σ qty of its
 * movements. Never throws: a failure is reported through the returned
 * warning so the payment is not rolled back (contract §5).
 */
export async function deductInventory(ctx: Ctx, orderId: string): Promise<string | null> {
  let failed = 0;
  try {
    const items = await loadItems(ctx, orderId);
    const productIds = Array.from(new Set(items.map((i: any) => i.product_id).filter(Boolean)));
    const products: Record<string, InvProduct | null> = {};
    for (const pid of productIds as string[]) {
      const [p] = await ctx.svc.entities.Product.filter({ id: pid });
      products[pid] = p ?? null;
    }
    const planned = planInventoryMovements(items, products);
    if (planned.length === 0) return null;

    const supplies: Record<string, any> = {};
    const touched = new Set<string>();
    for (const m of planned) {
      try {
        if (!(m.inventory_item_id in supplies)) {
          const [s] = await ctx.svc.entities.InventoryItem.filter({ id: m.inventory_item_id });
          supplies[m.inventory_item_id] = s ?? null;
        }
        const supply = supplies[m.inventory_item_id];
        if (!supply || supply.tenant_id !== ctx.tenantId) {
          failed++;
          continue;
        }
        touched.add(m.inventory_item_id);
        // A line already deducted as 'venta' (order closed, reopened, then the
        // line was cancelled as prepared) must not be deducted again as merma.
        if (m.type === 'merma') {
          const sold = await ctx.svc.entities.InventoryMovement.filter({
            tenant_id: ctx.tenantId,
            idempotency_key: `venta:${m.order_item_id}`,
          });
          if (sold.some((r: any) => (r.qty ?? 0) !== 0)) continue;
        }
        const existing = await ctx.svc.entities.InventoryMovement.filter({
          tenant_id: ctx.tenantId,
          idempotency_key: m.idempotency_key,
        });
        if (existing.length === 0) {
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
          // Re-read after writing: concurrent closers may have both created it.
          const rows = await ctx.svc.entities.InventoryMovement.filter({
            tenant_id: ctx.tenantId,
            idempotency_key: m.idempotency_key,
          });
          const survivor = pickSurvivor(rows);
          for (const row of rows) {
            if (survivor && row.id !== survivor.id && row.qty !== 0) {
              await ctx.svc.entities.InventoryMovement.update(row.id, { qty: 0, reason: 'duplicado' });
            }
          }
        }
      } catch {
        failed++;
      }
    }

    for (const itemId of touched) {
      try {
        const moves = await fetchAll(ctx.svc.entities.InventoryMovement, { tenant_id: ctx.tenantId, item_id: itemId });
        await ctx.svc.entities.InventoryItem.update(itemId, { stock: stockFromMovements(moves) });
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

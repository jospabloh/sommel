// Impure half of cancelOrder's inventory step (rules: planCancelOrderInventory
// in _logic.ts). Best effort, idempotent by key: never throws, reports a
// warning instead so the cancellation itself is not rolled back.
import type { Ctx } from '../_guard.ts';
import { planCancelOrderInventory, narrowByField } from './_logic.ts';

async function readIn(entity: any, base: Record<string, unknown>, field: string, ids: string[]): Promise<any[]> {
  const rows: any[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const part = ids.slice(i, i + 100);
    rows.push(...narrowByField(await entity.filter({ ...base, [field]: { $in: part } }), field, part));
  }
  return rows;
}

export async function cancelOrderInventory(ctx: Ctx, items: any[]): Promise<string | null> {
  const warning = 'No se pudo ajustar el inventario de la comanda cancelada. Revisa las existencias.';
  try {
    const itemIds = items.map((i: any) => i.id);
    const productIds = Array.from(new Set(items.map((i: any) => i.product_id).filter(Boolean))) as string[];
    const mv = ctx.svc.entities.InventoryMovement;
    const [products, movements] = await Promise.all([
      productIds.length ? readIn(ctx.svc.entities.Product, {}, 'id', productIds) : Promise.resolve([]),
      itemIds.length ? readIn(mv, { tenant_id: ctx.tenantId }, 'order_item_id', itemIds) : Promise.resolve([]),
    ]);
    const productsById: Record<string, any> = {};
    for (const p of products) productsById[p.id] = p;
    const ventaByItem = new Map<string, any>();
    const existingKeys = new Set<string>();
    for (const r of movements) {
      if (r.idempotency_key) existingKeys.add(r.idempotency_key);
      if (r.type === 'venta' && (r.qty ?? 0) !== 0) ventaByItem.set(r.order_item_id, r);
    }
    const planned = planCancelOrderInventory(items, productsById, ventaByItem).filter((m) => !existingKeys.has(m.idempotency_key));
    if (planned.length === 0) return null;

    const touched = new Set<string>();
    let failed = 0;
    for (const m of planned) {
      try {
        const [supply] = await ctx.svc.entities.InventoryItem.filter({ id: m.inventory_item_id });
        if (!supply || supply.tenant_id !== ctx.tenantId) {
          failed++;
          continue;
        }
        await mv.create({
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
        touched.add(m.inventory_item_id);
      } catch {
        failed++;
      }
    }
    for (const itemId of touched) {
      try {
        const rows = await mv.filter({ tenant_id: ctx.tenantId, item_id: itemId });
        const stock = Math.round(rows.reduce((s: number, r: any) => s + (typeof r.qty === 'number' ? r.qty : 0), 0) * 1000) / 1000;
        await ctx.svc.entities.InventoryItem.update(itemId, { stock });
      } catch {
        failed++;
      }
    }
    return failed > 0 ? warning : null;
  } catch {
    return warning;
  }
}

// inventory.list -> { items, low: [ids] }. `unit_cost` is redacted without
// Menú:ver_costos (D7); `low` = stock <= low_threshold.
import { requirePermission, hasPermission, type Ctx, type Route } from '../_guard.ts';
import { lowStockIds, redactUnitCost } from './_logic.ts';
import { fetchAll } from './_shared.ts';

export const list: Route = async (ctx: Ctx) => {
  await requirePermission(ctx, 'Inventario:ver');
  if (!ctx.tenantId) return { items: [], low: [] };

  const rows = await fetchAll(ctx.svc.entities.InventoryItem, { tenant_id: ctx.tenantId });
  rows.sort((a: any, b: any) => String(a.name ?? '').localeCompare(String(b.name ?? ''), 'es'));
  const canSeeCosts = await hasPermission(ctx, 'Menú:ver_costos');
  return {
    items: rows.map((r: any) => redactUnitCost(r, canSeeCosts)),
    low: lowStockIds(rows),
  };
};

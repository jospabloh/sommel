// inventory.archiveItem: gives an insumo "de baja" by stamping archived_at.
// The row and its movements are kept (history and waste reports still read
// them); it just leaves the list and the product-link picker. Refused with 409
// while products are still linked to it: unlink first, so no sale keeps
// deducting from an insumo nobody can see.
import { loadOwned, requirePermission, requireWritable, httpError, type Ctx, type Route } from '../_guard.ts';
import { isArchived, linkedProductNames } from './_logic.ts';
import { fetchAll } from './_shared.ts';

export const archiveItem: Route = async (ctx: Ctx, body: any) => {
  const item = await loadOwned(ctx, 'InventoryItem', body?.item_id);
  await requirePermission(ctx, 'Inventario:editar');
  requireWritable(ctx);

  // Idempotent: a repeat call finds it already archived.
  if (isArchived(item)) return { ok: true, item_id: item.id, archived_at: item.archived_at };

  const products = await fetchAll(ctx.svc.entities.Product, { tenant_id: item.tenant_id, inventory_item_id: item.id });
  const names = linkedProductNames(products, item.id);
  if (names.length > 0) {
    const shown = names.slice(0, 3).join(', ') + (names.length > 3 ? ` y ${names.length - 3} más` : '');
    httpError(409, 'item_linked', `Primero desliga los productos de este insumo: ${shown}`);
  }

  const archived_at = new Date().toISOString();
  await ctx.svc.entities.InventoryItem.update(item.id, { archived_at });
  return { ok: true, item_id: item.id, archived_at };
};

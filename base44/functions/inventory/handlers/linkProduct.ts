// inventory.linkProduct: ties a menu product to an InventoryItem (or unlinks
// it with `inventory_item_id: null`). Sets Product.track_inventory; the sale
// itself is deducted by `payments` when an order closes.
import { loadOwned, requirePermission, requireWritable, hasPermission, httpError, type Ctx, type Route } from '../_guard.ts';
import { INVENTORY_UNITS, redactProductCosts, resolveLinkQuantities } from './_logic.ts';
import { guardLogic } from './_shared.ts';

export const linkProduct: Route = async (ctx: Ctx, body: any) => {
  const product = await loadOwned(ctx, 'Product', body?.product_id);
  const unlink = body?.inventory_item_id === null;
  const item = unlink ? null : await loadOwned(ctx, 'InventoryItem', body?.inventory_item_id);

  await requirePermission(ctx, 'Inventario:editar');
  requireWritable(ctx);

  let patch: Record<string, unknown>;
  if (!item) {
    if (!unlink) httpError(400, 'invalid_body', 'Falta el insumo');
    // Quantities stay stored so re-linking later restores them.
    patch = { track_inventory: false, inventory_item_id: '' };
  } else {
    const q = guardLogic(() => resolveLinkQuantities(product, body));
    patch = {
      track_inventory: true,
      inventory_item_id: item.id,
      ...((INVENTORY_UNITS as readonly string[]).includes(item.unit) ? { stock_unit: item.unit } : {}),
      ...(q.inventory_qty !== undefined ? { inventory_qty: q.inventory_qty } : {}),
      ...(q.variants ? { variants: q.variants } : {}),
    };
  }

  await ctx.svc.entities.Product.update(product.id, patch);
  const [row] = await ctx.svc.entities.Product.filter({ id: product.id });
  const canSeeCosts = await hasPermission(ctx, 'Menú:ver_costos');
  return { product: redactProductCosts(row, canSeeCosts) };
};

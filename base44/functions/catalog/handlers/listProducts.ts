import type { Ctx } from '../_guard.ts';
import { requirePermission, hasPermission } from '../_guard.ts';
import { shapeRow, stripProductCosts } from './_logic.ts';

/**
 * `{ include_inactive? }` -> `{ categories, products }`. Strips `cost` (and
 * every `variants[].cost`) unless the caller has `Menú:ver_costos` — that is
 * the ONE place in this endpoint where the "cost never reaches the browser"
 * rule (contract §4, D7) is enforced; nothing else may read `Product`
 * directly per contract §1.
 */
export async function listProducts(ctx: Ctx, body: any) {
  await requirePermission(ctx, 'Menú:ver');

  if (!ctx.tenantId) return { categories: [], products: [] };

  const categoriesRaw = await ctx.svc.entities.Category.filter({ tenant_id: ctx.tenantId });
  const productsFilter: Record<string, unknown> = { tenant_id: ctx.tenantId };
  if (!body?.include_inactive) productsFilter.active = true;
  const productsRaw = await ctx.svc.entities.Product.filter(productsFilter);

  const categories = categoriesRaw.map(shapeRow).sort((a: any, b: any) => (a.sort ?? 0) - (b.sort ?? 0));
  let products = productsRaw.map(shapeRow);

  const canSeeCosts = await hasPermission(ctx, 'Menú:ver_costos');
  if (!canSeeCosts) {
    products = products.map(stripProductCosts);
  }

  return { categories, products };
}

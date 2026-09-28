import type { Ctx } from '../_guard.ts';
import { requirePermission, requireWritable, loadOwned, httpError } from '../_guard.ts';

/**
 * `{ id }` -> `{ ok }`. 409 `category_in_use` if any `Product` still
 * references it — deleting the category out from under a product would
 * orphan its `category_id` and, via `resolveStation`, silently change what
 * station new edits to that product resolve to.
 */
export async function deleteCategory(ctx: Ctx, body: any) {
  const existing = await loadOwned(ctx, 'Category', body?.id);

  await requirePermission(ctx, 'Menú:editar');
  requireWritable(ctx);

  const productsInCategory = await ctx.svc.entities.Product.filter({
    tenant_id: ctx.tenantId,
    category_id: existing.id,
  });
  if (productsInCategory.length > 0) {
    throw httpError(409, 'category_in_use', 'La categoría tiene productos; muévelos o bórralos primero');
  }

  await ctx.svc.entities.Category.delete(existing.id);
  return { ok: true };
}

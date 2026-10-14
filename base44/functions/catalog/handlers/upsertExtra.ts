import type { Ctx } from '../_guard.ts';
import { requirePermission, requireWritable, loadOwned, httpError } from '../_guard.ts';
import { normalizeExtraInput, validateExtra, unknownProductIds, shapeRow } from './_logic.ts';

/**
 * `{ id?, name, price, applies_to?, product_ids?, active?, sort? }` ->
 * `{ extra }`. Same guard order and permission as `upsertProduct`/
 * `upsertCategory` (contract §2): loadOwned (only when updating) ->
 * `Menú:editar` -> requireWritable -> validate -> write. Extras have no cost,
 * so `Menú:ver_costos` plays no part here.
 */
export async function upsertExtra(ctx: Ctx, body: any) {
  const isUpdate = typeof body?.id === 'string' && body.id.length > 0;
  const existing = isUpdate ? await loadOwned(ctx, 'MenuExtra', body.id) : null;

  await requirePermission(ctx, 'Menú:editar');
  requireWritable(ctx);

  if (!ctx.tenantId) throw httpError(403, 'no_tenant', 'No perteneces a ningún bar');

  const fields = normalizeExtraInput(body, existing);
  const error = validateExtra(fields);
  if (error) throw httpError(400, 'invalid_body', error);

  if (fields.applies_to === 'products') {
    // One tenant-filtered read for the whole list (not one loadOwned per id):
    // Base44's app-wide rate limit is tight.
    const owned = await ctx.svc.entities.Product.filter({ tenant_id: ctx.tenantId });
    const bad = unknownProductIds(fields.product_ids, owned.map((p: any) => p.id));
    if (bad.length > 0) throw httpError(404, 'not_found', 'Uno de los productos elegidos no existe');
  }

  let row: any;
  if (existing) {
    await ctx.svc.entities.MenuExtra.update(existing.id, fields);
    [row] = await ctx.svc.entities.MenuExtra.filter({ id: existing.id });
  } else {
    row = await ctx.svc.entities.MenuExtra.create({ tenant_id: ctx.tenantId, ...fields });
  }

  return { extra: shapeRow(row) };
}

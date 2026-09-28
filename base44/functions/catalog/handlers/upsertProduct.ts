import type { Ctx } from '../_guard.ts';
import { requirePermission, requireWritable, hasPermission, loadOwned, httpError } from '../_guard.ts';
import {
  normalizeProductFields,
  applyCost,
  applyVariantCosts,
  validateProduct,
  shapeRow,
  stripProductCosts,
} from './_logic.ts';

/**
 * `{ id?, name, category_id, station?, price, cost?, variants?, modifiers?,
 * active?, seasonal? }` -> `{ product }`. `Menú:editar` gates the whole
 * write; `Menú:ver_costos` gates `cost` specifically — see `applyCost`'s own
 * comment for why an omitted/unauthorized `cost` keeps the stored value
 * instead of ever being read as "clear it to zero" (the StockFlow
 * `MachinerySale.applyCost` lesson, contract §4).
 */
export async function upsertProduct(ctx: Ctx, body: any) {
  const isUpdate = typeof body?.id === 'string' && body.id.length > 0;
  const existing = isUpdate ? await loadOwned(ctx, 'Product', body.id) : null;

  await requirePermission(ctx, 'Menú:editar');
  requireWritable(ctx);

  if (!ctx.tenantId) throw httpError(403, 'no_tenant', 'No perteneces a ningún bar');

  const categoryId = typeof body?.category_id === 'string' && body.category_id
    ? body.category_id
    : existing?.category_id;
  if (!categoryId) throw httpError(400, 'invalid_body', 'La categoría es obligatoria');
  // loadOwned also confirms the category belongs to this same tenant.
  const category = await loadOwned(ctx, 'Category', categoryId);

  const canSeeCosts = await hasPermission(ctx, 'Menú:ver_costos');

  const fields = normalizeProductFields(body, category.station_default, existing);
  const storedCost = existing?.cost ?? null;
  const cost = applyCost(body, canSeeCosts, storedCost);
  const variants = applyVariantCosts(fields.variants, canSeeCosts, existing?.variants);

  const error = validateProduct(fields, cost, variants);
  if (error) throw httpError(400, 'invalid_body', error);

  // Fixed 2026-09-28: tenant_id must come from the STORED row on update, not
  // ctx.tenantId — a platform caller has no tenant of their own (ctx.tenantId
  // is null), so writing ctx.tenantId unconditionally on update rewrote a
  // tenant-owned product's tenant_id to null (orphaning it) the moment a
  // platform admin edited it. On create, ctx.tenantId IS the right value
  // (there is no existing row to inherit from).
  const payload = {
    tenant_id: existing ? existing.tenant_id : ctx.tenantId,
    name: fields.name,
    category_id: categoryId,
    station: fields.station,
    price: fields.price,
    cost,
    variants,
    modifiers: fields.modifiers,
    active: fields.active,
    seasonal: fields.seasonal,
  };

  let row: any;
  if (existing) {
    await ctx.svc.entities.Product.update(existing.id, payload);
    [row] = await ctx.svc.entities.Product.filter({ id: existing.id });
  } else {
    row = await ctx.svc.entities.Product.create(payload);
  }

  const shaped = shapeRow(row);
  return { product: canSeeCosts ? shaped : stripProductCosts(shaped) };
}

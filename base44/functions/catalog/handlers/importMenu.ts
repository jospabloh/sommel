import type { Ctx } from '../_guard.ts';
import { httpError } from '../_guard.ts';
import {
  normalizeSeedCategory,
  normalizeSeedProduct,
  normalizeCategoryKey,
  productImportKey,
} from './_logic.ts';

/**
 * `{ tenant_id, menu: <base44/seed/vindima-menu.json shape>, dry_run }` ->
 * `{ created, skipped, errors }`. Platform-only (`ctx.isPlatform`) — this is
 * onboarding, run by whoever loads a bar's menu, not a bar's own staff.
 *
 * `tenant_id` is in the payload rather than `ctx.tenantId` because the
 * platform caller running this typically has no bar of their own
 * (`requireContext`'s `allowNoTenant`) — the contract names no other way to
 * say which bar the menu goes into.
 *
 * Idempotent by (category name, product name), matched case-insensitively —
 * running the same import twice (or the same bar's menu file re-imported
 * after a correction) creates nothing a second time; it only reports
 * `skipped`. `dry_run` runs every step except the actual `create` calls, so
 * counts are computed the same way as a real run — it never estimates.
 */
export async function importMenu(ctx: Ctx, body: any) {
  if (!ctx.isPlatform) {
    throw httpError(403, 'forbidden', 'Solo la plataforma puede importar el menú');
  }

  const tenantId = typeof body?.tenant_id === 'string' ? body.tenant_id : '';
  if (!tenantId) throw httpError(400, 'invalid_body', 'Falta tenant_id del bar destino');
  const [bar] = await ctx.svc.entities.WineBar.filter({ id: tenantId });
  if (!bar) throw httpError(404, 'not_found', 'Bar no encontrado');

  const menu = body?.menu;
  if (!menu || !Array.isArray(menu.categories) || !Array.isArray(menu.products)) {
    throw httpError(400, 'invalid_body', 'El menú debe traer categories[] y products[]');
  }
  const dryRun = !!body?.dry_run;
  const errors: string[] = [];
  const created = { categories: 0, products: 0 };
  const skipped = { categories: 0, products: 0 };

  // ---- Categories ----
  const existingCategories = await ctx.svc.entities.Category.filter({ tenant_id: tenantId });
  const categoryIdByKey = new Map<string, string>();
  const categoryStationDefaultByKey = new Map<string, string>();
  for (const row of existingCategories) {
    const key = normalizeCategoryKey(row.data?.name);
    categoryIdByKey.set(key, row.id);
    categoryStationDefaultByKey.set(key, row.data?.station_default ?? 'none');
  }

  for (const rawCat of menu.categories) {
    const cat = normalizeSeedCategory(rawCat);
    if (!cat.name) {
      errors.push('Categoría sin nombre, omitida');
      continue;
    }
    const key = normalizeCategoryKey(cat.name);
    if (categoryIdByKey.has(key)) {
      skipped.categories++;
      continue;
    }
    categoryStationDefaultByKey.set(key, cat.station_default);
    if (dryRun) {
      created.categories++;
      // Placeholder id: dry_run never creates a product for real either, so
      // this is only consulted below to confirm the category "would exist".
      categoryIdByKey.set(key, '(dry-run)');
      continue;
    }
    const row = await ctx.svc.entities.Category.create({
      tenant_id: tenantId,
      name: cat.name,
      sort: cat.sort,
      station_default: cat.station_default,
    });
    categoryIdByKey.set(key, row.id);
    created.categories++;
  }

  // ---- Products ----
  const existingProducts = await ctx.svc.entities.Product.filter({ tenant_id: tenantId });
  const categoryNameById = new Map<string, string>(
    existingCategories.map((c: any) => [c.id, c.data?.name ?? ''])
  );
  const existingProductKeys = new Set<string>();
  for (const row of existingProducts) {
    const categoryName = categoryNameById.get(row.data?.category_id) ?? '';
    existingProductKeys.add(productImportKey(categoryName, row.data?.name));
  }

  for (const rawProd of menu.products) {
    const categoryName = typeof rawProd?.category === 'string' ? rawProd.category.trim() : '';
    const key = normalizeCategoryKey(categoryName);
    const categoryId = categoryIdByKey.get(key);
    if (!categoryId) {
      errors.push(`Producto "${rawProd?.name ?? ''}": categoría "${categoryName}" no existe`);
      continue;
    }
    const stationDefault = categoryStationDefaultByKey.get(key) ?? 'none';
    const prod = normalizeSeedProduct(rawProd, stationDefault);
    if (!prod.name) {
      errors.push('Producto sin nombre, omitido');
      continue;
    }
    const prodKey = productImportKey(categoryName, prod.name);
    if (existingProductKeys.has(prodKey)) {
      skipped.products++;
      continue;
    }
    existingProductKeys.add(prodKey);
    if (dryRun) {
      created.products++;
      continue;
    }
    await ctx.svc.entities.Product.create({
      tenant_id: tenantId,
      name: prod.name,
      category_id: categoryId,
      station: prod.station,
      price: prod.price,
      cost: prod.cost,
      variants: prod.variants,
      modifiers: prod.modifiers,
      active: prod.active,
      seasonal: prod.seasonal,
    });
    created.products++;
  }

  return { created, skipped, errors };
}

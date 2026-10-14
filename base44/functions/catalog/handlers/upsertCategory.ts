import type { Ctx } from '../_guard.ts';
import { requirePermission, requireWritable, loadOwned, httpError } from '../_guard.ts';
import { normalizeCategoryInput, validateCategory, shapeRow } from './_logic.ts';

/**
 * `{ id?, name, sort?, station_default? }` -> `{ category }`.
 * Mandatory order (contract §2): loadOwned (only when updating) ->
 * requirePermission -> requireWritable -> validate -> write.
 */
export async function upsertCategory(ctx: Ctx, body: any) {
  const isUpdate = typeof body?.id === 'string' && body.id.length > 0;
  const existing = isUpdate ? await loadOwned(ctx, 'Category', body.id) : null;

  await requirePermission(ctx, 'Menú:editar');
  requireWritable(ctx);

  if (!ctx.tenantId) throw httpError(403, 'no_tenant', 'No perteneces a ningún bar');

  // A typo in the station used to save silently as "Ninguna" (2026-10-14);
  // then nothing of that category ever reached cocina or barra.
  if (body?.station_default !== undefined && !['kitchen', 'bar', 'none'].includes(body.station_default)) {
    throw httpError(400, 'invalid_station', 'Estación no válida: elige Cocina, Barra o Ninguna');
  }
  const fields = normalizeCategoryInput(body, existing);
  const error = validateCategory(fields);
  if (error) throw httpError(400, 'invalid_body', error);

  let row: any;
  if (existing) {
    await ctx.svc.entities.Category.update(existing.id, fields);
    [row] = await ctx.svc.entities.Category.filter({ id: existing.id });
  } else {
    row = await ctx.svc.entities.Category.create({ tenant_id: ctx.tenantId, ...fields });
  }

  return { category: shapeRow(row) };
}

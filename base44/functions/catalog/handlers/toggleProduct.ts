import type { Ctx } from '../_guard.ts';
import { requirePermission, requireWritable, hasPermission, loadOwned } from '../_guard.ts';
import { shapeRow, stripProductCosts } from './_logic.ts';

/** `{ id, active }` -> `{ product }`. Touches only `active`. */
export async function toggleProduct(ctx: Ctx, body: any) {
  const existing = await loadOwned(ctx, 'Product', body?.id);

  await requirePermission(ctx, 'Menú:editar');
  requireWritable(ctx);

  const active = !!body?.active;
  await ctx.svc.entities.Product.update(existing.id, { active });
  const [row] = await ctx.svc.entities.Product.filter({ id: existing.id });

  const shaped = shapeRow(row);
  const canSeeCosts = await hasPermission(ctx, 'Menú:ver_costos');
  return { product: canSeeCosts ? shaped : stripProductCosts(shaped) };
}

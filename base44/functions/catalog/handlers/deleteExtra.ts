import type { Ctx } from '../_guard.ts';
import { requirePermission, requireWritable, loadOwned } from '../_guard.ts';

/**
 * `{ id }` -> `{ ok }`. Deleting is safe for past orders: every `OrderItem`
 * froze its extras (id, name, price) when the line was added, so nothing
 * reads this row afterwards.
 */
export async function deleteExtra(ctx: Ctx, body: any) {
  const existing = await loadOwned(ctx, 'MenuExtra', body?.id);

  await requirePermission(ctx, 'Menú:editar');
  requireWritable(ctx);

  await ctx.svc.entities.MenuExtra.delete(existing.id);
  return { ok: true };
}

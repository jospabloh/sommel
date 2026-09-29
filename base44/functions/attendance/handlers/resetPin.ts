// attendance.resetPin: deletes a member's PIN so they create a new one.
// Guard order: loadOwned (same bar) -> permission.
import { loadOwned, requirePermission, type Ctx, type Route } from '../_guard.ts';
import { requireTenant } from './_shared.ts';

export const resetPin: Route = async (ctx: Ctx, body: any) => {
  const target = await loadOwned(ctx, 'User', typeof body?.user_id === 'string' ? body.user_id : '');
  await requirePermission(ctx, 'Asistencia:corregir');
  const tenantId = requireTenant(ctx);
  const rows = await ctx.svc.entities.StaffPin.filter({ tenant_id: tenantId, user_id: target.id });
  for (const row of rows) await ctx.svc.entities.StaffPin.delete(row.id);
  return { ok: true };
};

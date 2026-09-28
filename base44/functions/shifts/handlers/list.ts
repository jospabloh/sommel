// shifts.list — closed shifts, newest first (entrega-2-contratos.md §5).
import { requirePermission, type Ctx, type Route } from '../_guard.ts';

export const list: Route = async (ctx: Ctx, body: any) => {
  await requirePermission(ctx, 'Turno:ver_corte');
  const raw = Number(body?.limit);
  const limit = Number.isInteger(raw) && raw > 0 ? Math.min(raw, 100) : 30;
  const all = await ctx.svc.entities.Shift.filter({ tenant_id: ctx.tenantId });
  const shifts = all
    .filter((s: any) => s.closed_at && s.summary)
    .sort((a: any, b: any) => String(b.closed_at).localeCompare(String(a.closed_at)))
    .slice(0, limit);
  return { shifts };
};

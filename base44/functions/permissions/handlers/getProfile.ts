// permissions.getProfile — the bar's override map for a role, for the
// Permisos screen. Read-only, so no billing gate: a suspended bar's admin can
// still see what their team may do. The tenant is ctx.tenantId, never the body.
import { httpError, HttpError, PERMISSION_DEFAULTS, pickSurvivor, type Ctx, type Route } from '../_guard.ts';
import { LogicError, canManagePermissions, normalizeRole, profileView } from './_logic.ts';

export const getProfile: Route = async (ctx: Ctx, body: any) => {
  // requireContext already refused a caller with no bar (no_tenant).
  if (!ctx.tenantId) httpError(403, 'no_tenant', 'No perteneces a ningún bar');
  if (!canManagePermissions(ctx)) httpError(403, 'forbidden', 'No tienes permiso para esta acción');

  let role: string;
  try {
    role = normalizeRole(body?.role);
  } catch (err) {
    if (err instanceof LogicError) throw new HttpError(400, err.code, err.message);
    throw err;
  }

  const rows = await ctx.svc.entities.PermissionProfile.filter({ tenant_id: ctx.tenantId, role });
  return { profile: profileView(pickSurvivor<any>(rows), role), known_keys: Object.keys(PERMISSION_DEFAULTS) };
};

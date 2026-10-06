// permissions.upsertProfile — replaces the override map of the caller's own
// bar for a role. Order (contract §2): permission -> requireWritable ->
// validate -> write with svc. Only real registry keys with boolean values are
// accepted; the tenant is ctx.tenantId, never the body (module 14).
import {
  forgetProfiles,
  httpError,
  HttpError,
  requireWritable,
  PERMISSION_DEFAULTS,
  pickSurvivor,
  type Ctx,
  type Route,
} from '../_guard.ts';
import { LogicError, canManagePermissions, normalizeRole, profileView, validateOverrides } from './_logic.ts';

export const upsertProfile: Route = async (ctx: Ctx, body: any) => {
  if (!ctx.tenantId) httpError(403, 'no_tenant', 'No perteneces a ningún bar');
  if (!canManagePermissions(ctx)) httpError(403, 'forbidden', 'No tienes permiso para esta acción');
  requireWritable(ctx);

  let role: string;
  let overrides: Record<string, boolean>;
  try {
    role = normalizeRole(body?.role);
    overrides = validateOverrides(body?.overrides, Object.keys(PERMISSION_DEFAULTS));
  } catch (err) {
    if (err instanceof LogicError) throw new HttpError(400, err.code, err.message);
    throw err;
  }

  const rows = await ctx.svc.entities.PermissionProfile.filter({ tenant_id: ctx.tenantId, role });
  const existing = pickSurvivor<any>(rows);
  if (existing) {
    await ctx.svc.entities.PermissionProfile.update(existing.id, { overrides });
    forgetProfiles(ctx.tenantId);
  } else {
    await ctx.svc.entities.PermissionProfile.create({ tenant_id: ctx.tenantId, role, overrides });
    forgetProfiles(ctx.tenantId);
  }
  return { profile: profileView({ overrides }, role) };
};

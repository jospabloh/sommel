// permissions.getPerson / setPersonOverrides — what the bar admin decided for
// ONE staff member (User.permission_overrides, write-locked: only this handler
// writes it, as service). The precedence lives in resolvePermission: person,
// then role profile, then default. The tenant is ctx.tenantId, never the body.
import { httpError, HttpError, PERMISSION_DEFAULTS, personName, personOverridesOf, requireWritable, type Ctx, type Route } from '../_guard.ts';
import { LogicError, canManagePermissions, personTargetProblem, profileView, validateOverrides } from './_logic.ts';

async function loadTarget(ctx: Ctx, rawId: unknown): Promise<any> {
  if (!ctx.tenantId) httpError(403, 'no_tenant', 'No perteneces a ningún bar');
  if (!canManagePermissions(ctx)) httpError(403, 'forbidden', 'No tienes permiso para esta acción');
  const id = typeof rawId === 'string' && rawId.length <= 64 ? rawId : '';
  const [row] = id ? await ctx.svc.entities.User.filter({ id }) : [];
  const problem = personTargetProblem(row, ctx.tenantId as string);
  if (problem) httpError(problem.status, problem.code, problem.message);
  return row;
}

function view(row: any) {
  return {
    user_id: row.id,
    name: personName(row),
    overrides: profileView({ overrides: personOverridesOf(row) }, 'staff').overrides,
  };
}

export const getPerson: Route = async (ctx: Ctx, body: any) => {
  const row = await loadTarget(ctx, body?.user_id);
  return { person: view(row), known_keys: Object.keys(PERMISSION_DEFAULTS) };
};

export const setPersonOverrides: Route = async (ctx: Ctx, body: any) => {
  const row = await loadTarget(ctx, body?.user_id);
  requireWritable(ctx);
  let overrides: Record<string, boolean>;
  try {
    overrides = validateOverrides(body?.overrides, Object.keys(PERMISSION_DEFAULTS));
  } catch (err) {
    if (err instanceof LogicError) throw new HttpError(400, err.code, err.message);
    throw err;
  }
  // Replaces the whole map, like upsertProfile: an empty map = "same as the role".
  await ctx.svc.entities.User.update(row.id, { permission_overrides: overrides });
  return { person: view({ ...row, permission_overrides: overrides }) };
};

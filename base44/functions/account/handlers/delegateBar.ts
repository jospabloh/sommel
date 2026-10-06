// account.delegateBar: the owner transfers the bar (WineBar.owner_id) to
// another bar_admin of the SAME bar. The target is looked up among the
// caller's own bar members (read fresh with the service role), so an id from
// another bar is simply "not found". Order: permission -> billing gate ->
// validate -> write. Ownership is a team change, so a suspended bar is 402.
import { httpError, HttpError, requirePermission, requireWritable, type Ctx, type Route, forgetBar } from '../_guard.ts';
import { ACCOUNT_DENIAL_MESSAGE, ACCOUNT_DENIAL_STATUS, checkDelegate, confirmationMatches } from './_logic.ts';

export const delegateBar: Route = async (ctx: Ctx, body: any) => {
  if (!ctx.tenantId || !ctx.bar) httpError(404, 'not_found', 'No se encontró el bar');
  await requirePermission(ctx, 'Equipo:cambiar_rol');
  requireWritable(ctx);

  const svc = ctx.svc;
  const targetId = typeof body?.user_id === 'string' ? body.user_id : '';
  // A terminal account (terminal mode) can never own the bar.
  const members = (await svc.entities.User.filter({ tenant_id: ctx.tenantId })).filter((u: any) => u.app_role !== 'terminal');
  const denial = checkDelegate({
    members,
    callerId: ctx.self.id,
    ownerId: ctx.bar.owner_id,
    targetId,
  });
  if (denial) throw new HttpError(ACCOUNT_DENIAL_STATUS[denial], denial, ACCOUNT_DENIAL_MESSAGE[denial]);

  const target = members.find((m: any) => m.id === targetId);
  if (!confirmationMatches(body?.confirm, target?.email)) {
    httpError(400, 'confirmation_mismatch', 'Escribe el correo de la persona para confirmar');
  }

  await svc.entities.WineBar.update(ctx.bar.id, { owner_id: targetId });
  forgetBar(ctx.bar.id);

  // Re-read: the target may have been demoted or removed between the pre-check
  // and the write. If so, put the bar back in the caller's hands.
  const [freshTarget] = await svc.entities.User.filter({ id: targetId });
  const stillValid = freshTarget?.tenant_id === ctx.tenantId && freshTarget?.app_role === 'bar_admin';
  if (!stillValid) {
    await svc.entities.WineBar.update(ctx.bar.id, { owner_id: ctx.self.id });
    forgetBar(ctx.bar.id);
    httpError(409, 'target_not_admin', ACCOUNT_DENIAL_MESSAGE.target_not_admin);
  }
  return { owner_id: targetId };
};

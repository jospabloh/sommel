// account.deleteMyAccount: the caller leaves the bar and their User row is
// deleted. Blocked for the owner (cede or delete the bar first) and for the
// last bar_admin. Any member may do this to themselves, so there is no
// permission key. No billing gate either: a person must be able to leave a
// suspended bar. Their PIN goes, an open clock-in is closed, and their history
// (orders, payments, attendance) stays with the bar.
import { httpError, HttpError, type Ctx, type Route } from '../_guard.ts';
import {
  ACCOUNT_CLOSE_NOTE,
  ACCOUNT_DENIAL_MESSAGE,
  ACCOUNT_DENIAL_STATUS,
  barLostAllAdmins,
  buildBajaTicket,
  checkDeleteMyAccount,
  closeAttendancePatch,
  confirmationMatches,
  isOpenAttendance,
} from './_logic.ts';
import { relinkUser, unlinkUser } from './_shared.ts';

export const deleteMyAccount: Route = async (ctx: Ctx, body: any) => {
  if (!ctx.tenantId || !ctx.bar) httpError(404, 'not_found', 'No se encontró el bar');
  const svc = ctx.svc;
  const selfId: string = ctx.self.id;

  // Typed confirmation, checked on the server as well: the caller's own stored
  // email, never a value from the body.
  if (!confirmationMatches(body?.confirm, ctx.self.email)) {
    httpError(400, 'confirmation_mismatch', 'Escribe tu correo para confirmar');
  }

  const members = await svc.entities.User.filter({ tenant_id: ctx.tenantId });
  const denial = checkDeleteMyAccount({
    members,
    callerId: selfId,
    ownerId: ctx.bar.owner_id,
    isPlatform: ctx.isPlatform,
  });
  if (denial) throw new HttpError(ACCOUNT_DENIAL_STATUS[denial], denial, ACCOUNT_DENIAL_MESSAGE[denial]);

  const tenantId = ctx.tenantId;
  const wasAdmin = ctx.appRole === 'bar_admin';
  const role = ctx.appRole;

  // Cut access first so nothing else can happen as this person.
  if (!(await unlinkUser(svc, selfId))) {
    httpError(500, 'remove_failed', 'No se pudo quitar el acceso');
  }

  // Recount (module 14): a concurrent departure may have left the bar with no
  // admin between the pre-check and now. Give the access back if so.
  const after = await svc.entities.User.filter({ tenant_id: tenantId });
  if (barLostAllAdmins(after, wasAdmin)) {
    await relinkUser(svc, selfId, tenantId, role);
    httpError(409, 'last_admin', ACCOUNT_DENIAL_MESSAGE.last_admin);
  }

  const pins = await svc.entities.StaffPin.filter({ tenant_id: tenantId, user_id: selfId });
  for (const pin of pins) await svc.entities.StaffPin.delete(pin.id);

  const nowIso = new Date().toISOString();

  // Tell ACACIA (STANDARD section 8). Best effort, written with the tenant
  // captured before the unlink.
  let ticketId: string | null = null;
  try {
    const ticket = await svc.entities.SupportTicket.create(
      buildBajaTicket({ scope: 'account', tenantId, barName: ctx.bar.name, actorEmail: ctx.self.email, nowIso }),
    );
    ticketId = ticket?.id ?? null;
  } catch (err) {
    console.error('deleteMyAccount: baja ticket not created', err instanceof Error ? err.message : err);
  }

  const records = await svc.entities.Attendance.filter({ tenant_id: tenantId, user_id: selfId }, '-clock_in', 200);
  for (const rec of records.filter(isOpenAttendance)) {
    await svc.entities.Attendance.update(rec.id, closeAttendancePatch(ctx.self.email, nowIso, ACCOUNT_CLOSE_NOTE));
  }

  // The bar link is already gone, so a failure here leaves a person with no
  // access rather than a half-deleted one; the client reports which case it was.
  let accountDeleted = true;
  try {
    await svc.entities.User.delete(selfId);
  } catch {
    accountDeleted = false;
  }
  return { account_deleted: accountDeleted, ticket_id: ticketId };
};

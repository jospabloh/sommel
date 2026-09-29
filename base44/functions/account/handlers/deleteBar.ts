// account.deleteBar (Decision 2, José 2026-09-29): archives the bar. Owner only.
//   - WineBar.billing_status = suspended + archived_at (first, and idempotent,
//     so a half-finished run can simply be retried by the owner);
//   - every user unlinked (tenant_id / app_role emptied), owner last;
//   - StaffPin and PENDING StaffInvite deleted;
//   - open clock-ins closed.
// KEPT, never touched: Order, OrderItem, Payment, Shift, CashMovement,
// InventoryMovement, Attendance (CFF art. 30: five years). No billing gate:
// a suspended bar's owner must still be able to close it.
import { httpError, HttpError, type Ctx, type Route } from '../_guard.ts';
import {
  ACCOUNT_DENIAL_MESSAGE,
  ACCOUNT_DENIAL_STATUS,
  BAR_CLOSE_NOTE,
  archivePatch,
  buildBajaTicket,
  checkDeleteBar,
  closeAttendancePatch,
  confirmationMatches,
  isOpenAttendance,
  isPendingInvite,
} from './_logic.ts';
import { unlinkUser } from './_shared.ts';

export const deleteBar: Route = async (ctx: Ctx, body: any) => {
  if (!ctx.tenantId || !ctx.bar) httpError(404, 'not_found', 'No se encontró el bar');
  const svc = ctx.svc;
  const bar = ctx.bar;
  const tenantId = ctx.tenantId;

  const denial = checkDeleteBar({ callerId: ctx.self.id, ownerId: bar.owner_id });
  if (denial) throw new HttpError(ACCOUNT_DENIAL_STATUS[denial], denial, ACCOUNT_DENIAL_MESSAGE[denial]);

  if (!confirmationMatches(body?.confirm, bar.name)) {
    httpError(400, 'confirmation_mismatch', 'Escribe el nombre del bar para confirmar');
  }

  const nowIso = new Date().toISOString();

  // 1. Archive first: if a later step fails the bar is already read-only and
  //    the owner (still linked) can retry.
  await svc.entities.WineBar.update(bar.id, archivePatch(bar, nowIso));
  const [fresh] = await svc.entities.WineBar.filter({ id: bar.id });
  if (fresh?.billing_status !== 'suspended') {
    httpError(500, 'archive_failed', 'No se pudo archivar el bar');
  }

  // 1b. Tell ACACIA (STANDARD section 8): a baja ticket, written BEFORE anyone
  //     is unlinked so it still carries the tenant. Best effort: a failure here
  //     never blocks the owner from closing their own bar.
  let ticketId: string | null = null;
  try {
    const ticket = await svc.entities.SupportTicket.create(
      buildBajaTicket({ scope: 'bar', tenantId, barName: bar.name, actorEmail: ctx.self.email, nowIso }),
    );
    ticketId = ticket?.id ?? null;
  } catch (err) {
    console.error('deleteBar: baja ticket not created', err instanceof Error ? err.message : err);
  }

  // 2. Things that hang off the team.
  const pins = await svc.entities.StaffPin.filter({ tenant_id: tenantId });
  for (const pin of pins) await svc.entities.StaffPin.delete(pin.id);

  const invites = await svc.entities.StaffInvite.filter({ tenant_id: tenantId });
  const pending = invites.filter(isPendingInvite);
  for (const inv of pending) await svc.entities.StaffInvite.delete(inv.id);

  const attendance = await svc.entities.Attendance.filter({ tenant_id: tenantId }, '-clock_in', 500);
  for (const rec of attendance.filter(isOpenAttendance)) {
    await svc.entities.Attendance.update(rec.id, closeAttendancePatch(ctx.self.email, nowIso, BAR_CLOSE_NOTE));
  }

  // 3. Unlink everyone, the owner (the caller) last so a partial failure can
  //    be retried by the same person.
  const members = await svc.entities.User.filter({ tenant_id: tenantId });
  const others = members.filter((m: any) => m.id !== ctx.self.id);
  let failed = 0;
  for (const m of others) {
    if (!(await unlinkUser(svc, m.id))) failed++;
  }
  if (failed > 0) {
    httpError(500, 'unlink_incomplete', 'No se pudo desligar a todo el equipo. Vuelve a intentarlo', { failed });
  }
  if (!(await unlinkUser(svc, ctx.self.id))) {
    httpError(500, 'unlink_incomplete', 'No se pudo cerrar tu acceso. Vuelve a intentarlo');
  }

  return {
    ticket_id: ticketId,
    archived_at: (fresh as any)?.archived_at ?? nowIso,
    users_unlinked: others.length + 1,
    pins_deleted: pins.length,
    invites_deleted: pending.length,
  };
};

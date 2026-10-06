// attendance.punch: entrada / salida with the person's own PIN.
// Guard order: loadOwned (member of THIS bar) -> permission -> self or team
// -> billing gate -> validate -> PIN checks -> write. The bar always comes
// from ctx.
import {
  HttpError,
  hasPermission,
  httpError,
  loadOwned,
  pickSurvivor,
  requirePermission,
  requireWritable,
  type Ctx,
  type Route,
} from '../_guard.ts';
import { verifyPin } from './_pin.ts';
import { canPunchFor, decidePunch, displayName, isForgotten, lockMinutesLeft, openRecords, validatePin } from './_logic.ts';
import { guardLogic, personRecords, recordPinFailure, requireTenant } from './_shared.ts';
import { photoRequired, punchAlerts, raiseAlerts, savePhoto, validatePhoto } from '../_security.ts';

/** Photo and alerts (anti PIN-sharing). Never blocks the punch. */
async function antiSharingChecks(ctx: Ctx, target: any, name: string, rawPhoto: unknown, action: string, attendanceId: string | null, nowMs: number): Promise<void> {
  try {
    const tenantId = ctx.tenantId as string;
    const photo = validatePhoto(rawPhoto);
    const device = ctx.terminal?.device ?? null;
    const photoId = await savePhoto(ctx.svc, {
      tenantId, person: target, personName: name, kind: 'punch', photo,
      terminalId: device?.id ?? null, terminalName: device?.name ?? null, attendanceId, nowMs,
    });
    const drafts = punchAlerts({ photoRequired: photoRequired(target), photoGiven: !!photo, action });
    await raiseAlerts(ctx.svc, { tenantId, userId: target.id, userName: name, drafts, terminalId: device?.id ?? null, photoId, nowMs });
  } catch (err) {
    console.error('punch anti-sharing checks failed', (err as Error).message);
  }
}

export const punch: Route = async (ctx: Ctx, body: any) => {
  const userId = typeof body?.user_id === 'string' ? body.user_id : '';
  const target = await loadOwned(ctx, 'User', userId);
  await requirePermission(ctx, 'Asistencia:checar');
  // Punching for someone else is a team action, not just knowing their PIN.
  if (!canPunchFor(target.id, ctx.user?.id, await hasPermission(ctx, 'Asistencia:ver_equipo'))) {
    httpError(403, 'not_self', 'Solo puedes checar con tu propio usuario');
  }
  requireWritable(ctx);
  const tenantId = requireTenant(ctx);
  const pin = guardLogic(() => validatePin(body?.pin));
  const name = displayName(target);

  const [pinRow] = await ctx.svc.entities.StaffPin.filter({ tenant_id: tenantId, user_id: target.id });
  if (!pinRow) httpError(409, 'no_pin', 'Esta persona todavía no crea su PIN');

  const nowMs = Date.now();
  const left = lockMinutesLeft(pinRow.locked_until, nowMs);
  if (left > 0) {
    httpError(423, 'pin_locked', `Demasiados intentos. Vuelve a intentar en ${left} min`, { minutes_left: left });
  }

  const ok = await verifyPin(pin, pinRow.salt, pinRow.pin_hash);
  if (!ok) {
    await recordPinFailure(ctx, pinRow, nowMs);
    throw new HttpError(401, 'wrong_pin', 'PIN incorrecto');
  }
  if ((pinRow.failed_attempts ?? 0) !== 0 || pinRow.locked_until) {
    await ctx.svc.entities.StaffPin.update(pinRow.id, { failed_attempts: 0, locked_until: null });
  }

  const records = await personRecords(ctx, target.id);
  const decision = decidePunch(records, nowMs);

  if (decision.kind === 'double_tap') {
    return { record: decision.record, action: decision.action, name };
  }

  if (decision.kind === 'salida') {
    const record = await ctx.svc.entities.Attendance.update(decision.record.id, {
      clock_out: new Date(nowMs).toISOString(),
    });
    await antiSharingChecks(ctx, target, name, body?.photo, 'salida', decision.record.id, nowMs);
    return { record, action: 'salida', name };
  }

  const created = await ctx.svc.entities.Attendance.create({
    tenant_id: tenantId,
    user_id: target.id,
    user_name: name,
    clock_in: new Date(nowMs).toISOString(),
    clock_out: null,
  });

  // Two concurrent taps may both have created an entry: re-read the open
  // ones and keep the oldest. Duplicates carry no money, so they are deleted.
  // A forgotten (> 16 h) open mark is not a duplicate of the new entrada.
  const open = openRecords(await personRecords(ctx, target.id)).filter((r) => !isForgotten(r, nowMs));
  let record = created;
  if (open.length > 1) {
    const survivor = pickSurvivor(open);
    for (const r of open) {
      if (r.id !== survivor?.id) await ctx.svc.entities.Attendance.delete(r.id);
    }
    if (survivor) record = survivor;
  }
  await antiSharingChecks(ctx, target, name, body?.photo, 'entrada', record?.id ?? null, nowMs);
  return { record, action: 'entrada', name };
};

// attendance.punch: entrada / salida with the person's own PIN.
// Guard order: loadOwned (member of THIS bar) -> permission -> billing gate ->
// validate -> PIN checks -> write. The bar always comes from ctx.
import {
  HttpError,
  httpError,
  loadOwned,
  pickSurvivor,
  requirePermission,
  requireWritable,
  type Ctx,
  type Route,
} from '../_guard.ts';
import { verifyPin } from './_pin.ts';
import { decidePunch, displayName, isForgotten, lockMinutesLeft, openRecords, validatePin } from './_logic.ts';
import { guardLogic, personRecords, recordPinFailure, requireTenant } from './_shared.ts';

export const punch: Route = async (ctx: Ctx, body: any) => {
  const userId = typeof body?.user_id === 'string' ? body.user_id : '';
  const target = await loadOwned(ctx, 'User', userId);
  await requirePermission(ctx, 'Asistencia:checar');
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
  return { record, action: 'entrada', name };
};

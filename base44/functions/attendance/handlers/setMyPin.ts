// attendance.setMyPin: create or change the CALLER's own PIN (ctx.user.id,
// never a user id from the body). Changing needs the current PIN, and a wrong
// current PIN counts toward the same lockout as a wrong punch.
import { HttpError, httpError, requirePermission, type Ctx, type Route } from '../_guard.ts';
import { hashPin, verifyPin } from './_pin.ts';
import { lockMinutesLeft, validatePin } from './_logic.ts';
import { guardLogic, recordPinFailure, requireTenant } from './_shared.ts';

export const setMyPin: Route = async (ctx: Ctx, body: any) => {
  await requirePermission(ctx, 'Asistencia:checar');
  const tenantId = requireTenant(ctx);
  const pin = guardLogic(() => validatePin(body?.pin));

  const [existing] = await ctx.svc.entities.StaffPin.filter({ tenant_id: tenantId, user_id: ctx.user.id });

  if (existing) {
    const nowMs = Date.now();
    const left = lockMinutesLeft(existing.locked_until, nowMs);
    if (left > 0) {
      httpError(423, 'pin_locked', `Demasiados intentos. Vuelve a intentar en ${left} min`, { minutes_left: left });
    }
    if (typeof body?.current_pin !== 'string' || !body.current_pin) {
      httpError(400, 'current_pin_required', 'Escribe tu PIN actual para cambiarlo');
    }
    const ok = await verifyPin(body.current_pin, existing.salt, existing.pin_hash);
    if (!ok) {
      await recordPinFailure(ctx, existing, nowMs);
      throw new HttpError(401, 'wrong_pin', 'Tu PIN actual es incorrecto');
    }
  }

  const { salt, pin_hash } = await hashPin(pin);
  const fields = { salt, pin_hash, failed_attempts: 0, locked_until: null };
  if (existing) {
    await ctx.svc.entities.StaffPin.update(existing.id, fields);
  } else {
    await ctx.svc.entities.StaffPin.create({ tenant_id: tenantId, user_id: ctx.user.id, ...fields });
  }
  return { ok: true };
};

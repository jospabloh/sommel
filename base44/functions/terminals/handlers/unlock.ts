// terminals.unlock: a person of this bar types their PIN at the terminal and
// gets a 15-minute pass. Same lockout as the checador: 5 misses, 15 minutes.
import { allowLockedTerminal, HttpError, httpError, issuePass, personMayUseTerminal, type Ctx } from '../_guard.ts';
import { verifyPin } from '../_pin.ts';
import { displayName, isValidPin, lockMinutesLeft, registerFailure } from '../_terminal_logic.ts';
import { requireTerminal } from './_shared.ts';

export const unlock = allowLockedTerminal(async (ctx: Ctx, body: any) => {
  const device = requireTerminal(ctx);
  const userId = typeof body?.user_id === 'string' ? body.user_id : '';
  if (!isValidPin(body?.pin)) httpError(400, 'invalid_pin', 'El PIN debe tener de 4 a 6 números');

  const [person] = userId ? await ctx.svc.entities.User.filter({ id: userId }) : [];
  // Missing, another bar, a terminal, or not on this terminal's list: one answer.
  if (!person || !personMayUseTerminal(person, device)) httpError(404, 'not_found', 'Esa persona no puede usar esta terminal');

  const [pinRow] = await ctx.svc.entities.StaffPin.filter({ tenant_id: device.tenant_id, user_id: person.id });
  if (!pinRow) httpError(409, 'no_pin', 'Esta persona todavía no crea su PIN');

  const nowMs = Date.now();
  const left = lockMinutesLeft(pinRow.locked_until, nowMs);
  if (left > 0) httpError(423, 'pin_locked', `Demasiados intentos. Vuelve a intentar en ${left} min`, { minutes_left: left });

  if (!(await verifyPin(body.pin, pinRow.salt, pinRow.pin_hash))) {
    const [fresh] = await ctx.svc.entities.StaffPin.filter({ id: pinRow.id });
    const row = fresh ?? pinRow;
    const next = registerFailure(Math.max(row.failed_attempts ?? 0, pinRow.failed_attempts ?? 0), nowMs);
    await ctx.svc.entities.StaffPin.update(pinRow.id, next);
    throw new HttpError(401, 'wrong_pin', 'PIN incorrecto');
  }
  if ((pinRow.failed_attempts ?? 0) !== 0 || pinRow.locked_until) {
    await ctx.svc.entities.StaffPin.update(pinRow.id, { failed_attempts: 0, locked_until: null });
  }

  const { pass, expires_at } = await issuePass(ctx, person.id);
  return { pass, expires_at, person: { id: person.id, name: displayName(person), app_role: person.app_role } };
});

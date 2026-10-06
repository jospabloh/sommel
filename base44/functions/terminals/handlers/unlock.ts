// terminals.unlock: a person of this bar types their PIN at the terminal and
// gets a 15-minute pass. Same lockout as the checador (5 misses, 15 minutes
// per person) plus one for the terminal itself (10 misses across people), and
// every unlock bumps the device's pass epoch so the previous person's pass
// dies at once.
import { allowLockedTerminal, personOverridesOf, HttpError, httpError, issuePass, passEpochOf, personMayUseTerminal, type Ctx } from '../_guard.ts';
import { verifyPin } from '../_pin.ts';
import { displayName, isOnShift, isValidPin, lockMinutesLeft, registerDeviceFailure, registerFailure } from '../_terminal_logic.ts';
import { otherTerminalsInUse, photoRequired, raiseAlerts, savePhoto, unlockAlerts, usesChecador, validatePhoto } from '../_security.ts';
import { requireTerminal } from './_shared.ts';

function lockedError(left: number): never {
  httpError(423, 'pin_locked', `Demasiados intentos. Vuelve a intentar en ${left} min`, { minutes_left: left });
}

export const unlock = allowLockedTerminal(async (ctx: Ctx, body: any) => {
  const device = requireTerminal(ctx);
  const nowMs = Date.now();
  const deviceLeft = lockMinutesLeft(device.unlock_locked_until, nowMs);
  if (deviceLeft > 0) lockedError(deviceLeft);

  const userId = typeof body?.user_id === 'string' ? body.user_id : '';
  if (!isValidPin(body?.pin)) httpError(400, 'invalid_pin', 'El PIN debe tener de 4 a 6 números');

  const [person] = userId ? await ctx.svc.entities.User.filter({ id: userId }) : [];
  // Missing, another bar, a terminal, or not on this terminal's list: one answer.
  if (!person || !personMayUseTerminal(person, device)) httpError(404, 'not_found', 'Esa persona no puede usar esta terminal');

  const [pinRow] = await ctx.svc.entities.StaffPin.filter({ tenant_id: device.tenant_id, user_id: person.id });
  if (!pinRow) httpError(409, 'no_pin', 'Esta persona todavía no crea su PIN');

  const left = lockMinutesLeft(pinRow.locked_until, nowMs);
  if (left > 0) lockedError(left);

  if (!(await verifyPin(body.pin, pinRow.salt, pinRow.pin_hash))) {
    // Re-read both rows right before writing (same shape as the checador's
    // recordPinFailure): a parallel miss that already locked wins.
    const [[freshPin], [freshDevice]] = await Promise.all([
      ctx.svc.entities.StaffPin.filter({ id: pinRow.id }),
      ctx.svc.entities.TerminalDevice.filter({ id: device.id }),
    ]);
    const pinNow = freshPin ?? pinRow;
    const devNow = freshDevice ?? device;
    const pinLeft = lockMinutesLeft(pinNow.locked_until, nowMs);
    if (pinLeft > 0) lockedError(pinLeft);
    const devLeft = lockMinutesLeft(devNow.unlock_locked_until, nowMs);
    if (devLeft > 0) lockedError(devLeft);
    await Promise.all([
      ctx.svc.entities.StaffPin.update(pinRow.id, registerFailure(Math.max(pinNow.failed_attempts ?? 0, pinRow.failed_attempts ?? 0), nowMs)),
      ctx.svc.entities.TerminalDevice.update(device.id, registerDeviceFailure(Math.max(devNow.failed_unlocks ?? 0, device.failed_unlocks ?? 0), nowMs)),
    ]);
    throw new HttpError(401, 'wrong_pin', 'PIN incorrecto');
  }

  if ((pinRow.failed_attempts ?? 0) !== 0 || pinRow.locked_until) {
    await ctx.svc.entities.StaffPin.update(pinRow.id, { failed_attempts: 0, locked_until: null });
  }
  const epoch = passEpochOf(device) + 1;
  await ctx.svc.entities.TerminalDevice.update(device.id, {
    pass_epoch: epoch, failed_unlocks: 0, unlock_locked_until: null,
    unlocked_user_id: person.id, unlocked_at: new Date(nowMs).toISOString(),
  });

  const { pass, expires_at } = await issuePass(ctx, person.id, epoch);
  await antiSharingChecks(ctx, device, person, body?.photo, nowMs);
  return {
    pass,
    expires_at,
    person: { id: person.id, name: displayName(person), email: person.email ?? '', app_role: person.app_role, permission_overrides: personOverridesOf(person) },
  };
});

/** Photo and alerts (anti PIN-sharing). Never blocks the unlock. */
async function antiSharingChecks(ctx: Ctx, device: any, person: any, rawPhoto: unknown, nowMs: number): Promise<void> {
  try {
    const tenantId = device.tenant_id;
    const name = displayName(person);
    const photo = validatePhoto(rawPhoto);
    const [devices, records] = await Promise.all([
      ctx.svc.entities.TerminalDevice.filter({ tenant_id: tenantId }).catch(() => []),
      ctx.svc.entities.Attendance.filter({ tenant_id: tenantId, user_id: person.id }, '-clock_in', 20).catch(() => []),
    ]);
    const photoId = await savePhoto(ctx.svc, {
      tenantId, person, personName: name, kind: 'unlock', photo,
      terminalId: device.id, terminalName: device.name ?? null, nowMs,
    });
    const drafts = unlockAlerts({
      appRole: person.app_role,
      photoRequired: photoRequired(person),
      photoGiven: !!photo,
      onShift: records.some((r: any) => isOnShift(r, nowMs)),
      usesChecador: usesChecador(records, nowMs),
      otherTerminals: otherTerminalsInUse(devices, { userId: person.id, deviceId: device.id, nowMs }),
      terminalName: device.name || 'sin nombre',
    });
    await raiseAlerts(ctx.svc, { tenantId, userId: person.id, userName: name, drafts, terminalId: device.id, photoId, nowMs });
  } catch (err) {
    console.error('unlock anti-sharing checks failed', (err as Error).message);
  }
}

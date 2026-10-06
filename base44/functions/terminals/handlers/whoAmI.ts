// terminals.whoAmI: what a terminal shows on "¿Quién eres?". Runs locked.
import { allowLockedTerminal, terminalAllows, type Ctx } from '../_guard.ts';
import { buildRoster, displayName, isOnShift, shouldTouchLastSeen } from '../_terminal_logic.ts';
import { barPeople, requireTerminal } from './_shared.ts';

export const whoAmI = allowLockedTerminal(async (ctx: Ctx) => {
  const device = requireTerminal(ctx);
  const tenantId = device.tenant_id;
  const nowMs = Date.now();
  const [people, pins, openRows] = await Promise.all([
    barPeople(ctx, tenantId),
    ctx.svc.entities.StaffPin.filter({ tenant_id: tenantId }),
    ctx.svc.entities.Attendance.filter({ tenant_id: tenantId, clock_out: null }, '-clock_in', 500).catch(() => []),
  ]);
  const onShift = new Set<string>(openRows.filter((r: any) => isOnShift(r, nowMs)).map((r: any) => r.user_id));
  const roster = buildRoster(people, {
    tenantId,
    allows: (id) => terminalAllows(device.allowed, id),
    withPin: new Set(pins.map((p: any) => p.user_id)),
    onShift,
  });
  if (shouldTouchLastSeen(device.last_seen_at, nowMs)) {
    await ctx.svc.entities.TerminalDevice.update(device.id, { last_seen_at: new Date(nowMs).toISOString() }).catch(() => {});
  }
  return {
    terminal: { id: device.id, name: device.name },
    bar: { name: ctx.bar?.name ?? '' },
    people: roster,
    unlocked: ctx.terminal?.unlocked
      ? { id: ctx.self.id, name: displayName(ctx.self), app_role: ctx.self.app_role }
      : null,
  };
});

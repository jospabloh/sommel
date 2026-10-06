// attendance.roster: members of the bar with PIN and inside/outside state.
// With Asistencia:ver_equipo the whole team (shared-tablet grid); without it
// only the caller, so a staff session never sees the team. Read-only.
import { hasPermission, requirePermission, type Ctx, type Route } from '../_guard.ts';
import { displayName, isForgotten, openRecords, rosterFor } from './_logic.ts';
import { requireTenant, tenantRecentRecords } from './_shared.ts';

export const roster: Route = async (ctx: Ctx) => {
  await requirePermission(ctx, 'Asistencia:checar');
  const tenantId = requireTenant(ctx);

  const [users, pins, records] = await Promise.all([
    ctx.svc.entities.User.filter({ tenant_id: tenantId }),
    ctx.svc.entities.StaffPin.filter({ tenant_id: tenantId }),
    tenantRecentRecords(ctx, tenantId),
  ]);
  const withPin = new Set(pins.map((p: any) => p.user_id));
  const nowMs = Date.now();
  const openByUser = new Map<string, any[]>();
  for (const r of records) {
    if (r.clock_out) continue;
    const list = openByUser.get(r.user_id) ?? [];
    list.push(r);
    openByUser.set(r.user_id, list);
  }

  const people = users
    .map((u: any) => {
      // Prefer a live entrada over a forgotten one left open from before.
      const opens = openRecords(openByUser.get(u.id) ?? []);
      const open = opens.find((r) => !isForgotten(r, nowMs)) ?? opens[0];
      return {
        user_id: u.id,
        name: displayName(u),
        has_pin: withPin.has(u.id),
        inside: !!open,
        ...(open ? { since: open.clock_in, forgotten: isForgotten(open, nowMs) } : {}),
      };
    })
    .sort((a: any, b: any) => a.name.localeCompare(b.name, 'es'));

  const seeTeam = await hasPermission(ctx, 'Asistencia:ver_equipo');
  return { people: rosterFor(people, ctx.user?.id, seeTeam), see_team: seeTeam };
};

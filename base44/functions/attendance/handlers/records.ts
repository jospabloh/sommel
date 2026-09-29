// attendance.records: marks + minutes per person for a local-date range.
// Staff (no Asistencia:ver_equipo) only ever get their own; a user_id in the
// body is ignored for them. Read-only, no billing gate.
import {
  hasPermission,
  localDayRange,
  requirePermission,
  type Ctx,
  type Route,
} from '../_guard.ts';
import { overlapsRange, totalsByPerson, validateDateRange } from './_logic.ts';
import { fetchRanged, guardLogic, requireTenant, viewRecord } from './_shared.ts';

export const records: Route = async (ctx: Ctx, body: any) => {
  await requirePermission(ctx, 'Asistencia:checar');
  const tenantId = requireTenant(ctx);
  const range = guardLogic(() => validateDateRange(body?.from, body?.to));
  const fromISO = localDayRange(range.from).fromISO;
  const toISO = localDayRange(range.to).toISO;
  const fromMs = Date.parse(fromISO);
  const toMs = Date.parse(toISO);

  const team = await hasPermission(ctx, 'Asistencia:ver_equipo');
  const filter: Record<string, unknown> = { tenant_id: tenantId };
  if (!team) filter.user_id = ctx.user.id;
  else if (typeof body?.user_id === 'string' && body.user_id) filter.user_id = body.user_id;

  const nowMs = Date.now();
  // Paged read narrowed by range (clock_in before the range end); the
  // in-memory overlap check below stays authoritative.
  const all = await fetchRanged(ctx, filter, { clock_in: { $lt: toISO } });
  const inRange = all
    .filter((r: any) => r.tenant_id === tenantId && overlapsRange(r, nowMs, fromMs, toMs))
    .sort((a: any, b: any) => Date.parse(b.clock_in) - Date.parse(a.clock_in));

  return {
    records: inRange.map((r: any) => viewRecord(r, nowMs)),
    totals: totalsByPerson(inRange, nowMs, { fromMs, toMs }),
  };
};

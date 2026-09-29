// Impure helpers shared across `attendance` handlers (they touch Ctx/svc, so
// they live apart from the import-free _logic.ts).
import { HttpError, httpError, type Ctx } from '../_guard.ts';
import { LogicError, isForgotten, lockMinutesLeft, recordMinutes, registerFailure } from './_logic.ts';

/** Runs pure logic and maps its LogicError to a 400 HttpError. */
export function guardLogic<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof LogicError) throw new HttpError(400, err.code, err.message);
    throw err;
  }
}

/** Attendance needs a bar of its own; a platform caller without one cannot punch. */
export function requireTenant(ctx: Ctx): string {
  if (!ctx.tenantId) httpError(403, 'no_tenant', 'No perteneces a ningún bar');
  return ctx.tenantId as string;
}

/** Decorates a record for the client. */
export function viewRecord(rec: any, nowMs: number) {
  return { ...rec, forgotten: isForgotten(rec, nowMs), minutes: recordMinutes(rec, nowMs) };
}

const PAGE = 500;
const MAX_ROWS = 50_000;
const PERSON_RECENT = 50;

/** Merges row lists by id (first occurrence wins). */
function mergeById(...lists: any[][]): any[] {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const list of lists) {
    for (const r of list) {
      if (r?.id && seen.has(r.id)) continue;
      if (r?.id) seen.add(r.id);
      out.push(r);
    }
  }
  return out;
}

/**
 * Open rows matching `base`. Best-effort `clock_out: null` query, re-checked
 * in memory so a backend that ignores the null filter cannot add closed rows.
 */
async function openRows(ctx: Ctx, base: Record<string, unknown>, limit: number): Promise<any[]> {
  try {
    const rows = await ctx.svc.entities.Attendance.filter({ ...base, clock_out: null }, '-clock_in', limit);
    return rows.filter((r: any) => !r.clock_out);
  } catch {
    return [];
  }
}

/** Latest marks of one person plus any open one, bounded (never the whole table). */
export async function personRecords(ctx: Ctx, userId: string): Promise<any[]> {
  const base = { tenant_id: ctx.tenantId, user_id: userId };
  const [recent, open] = await Promise.all([
    ctx.svc.entities.Attendance.filter(base, '-clock_in', PERSON_RECENT),
    openRows(ctx, base, PERSON_RECENT),
  ]);
  return mergeById(recent, open);
}

/** Recent marks of the whole bar plus every open one, bounded. */
export async function tenantRecentRecords(ctx: Ctx, tenantId: string): Promise<any[]> {
  const base = { tenant_id: tenantId };
  const [recent, open] = await Promise.all([
    ctx.svc.entities.Attendance.filter(base, '-clock_in', PAGE),
    openRows(ctx, base, PAGE),
  ]);
  return mergeById(recent, open);
}

/** Reads every row for a query, page by page (Base44 caps a single filter page). */
export async function fetchAll(ctx: Ctx, query: Record<string, unknown>): Promise<any[]> {
  const out: any[] = [];
  for (let skip = 0; skip < MAX_ROWS; skip += PAGE) {
    const rows = await ctx.svc.entities.Attendance.filter(query, '-clock_in', PAGE, skip);
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

/** fetchAll with a range query first; falls back to `base` alone if the range is rejected. */
export async function fetchRanged(
  ctx: Ctx,
  base: Record<string, unknown>,
  range: Record<string, unknown>
): Promise<any[]> {
  try {
    return await fetchAll(ctx, { ...base, ...range });
  } catch {
    return await fetchAll(ctx, base);
  }
}

/**
 * Registers a wrong PIN on a StaffPin row. Re-reads the row right before
 * writing so parallel guesses build on the freshest counter and never
 * overwrite a lock another request just set. Throws 423 if it is locked now.
 * Best-effort under concurrency: Base44 has no atomic increment.
 */
export async function recordPinFailure(ctx: Ctx, pinRow: any, nowMs: number): Promise<void> {
  const [fresh] = await ctx.svc.entities.StaffPin.filter({ id: pinRow.id });
  const row = fresh ?? pinRow;
  const left = lockMinutesLeft(row.locked_until, nowMs);
  if (left > 0) {
    httpError(423, 'pin_locked', `Demasiados intentos. Vuelve a intentar en ${left} min`, { minutes_left: left });
  }
  const next = registerFailure(Math.max(row.failed_attempts ?? 0, pinRow.failed_attempts ?? 0), nowMs);
  await ctx.svc.entities.StaffPin.update(pinRow.id, {
    failed_attempts: next.failed_attempts,
    locked_until: next.locked_until,
  });
}

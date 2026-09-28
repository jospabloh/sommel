// shifts.printCorte — entrega-2-contratos.md §5. One PrintJob per shift
// (`dedupe_key = corte:<shift_id>`); asking again returns that same job.
// Reprinting on purpose goes through `printing.reprint`, not through here.
import {
  BAR_UTC_OFFSET_MIN,
  httpError,
  loadOwned,
  pickSurvivor,
  requirePermission,
  requireWritable,
  type Ctx,
  type Route,
} from '../_guard.ts';
import { formatLocalDateTime } from './_logic.ts';
import { corteLines } from './_shared.ts';

export const printCorte: Route = async (ctx: Ctx, body: any) => {
  const shift = await loadOwned(ctx, 'Shift', body?.shift_id);
  await requirePermission(ctx, 'Turno:ver_corte');
  requireWritable(ctx);
  if (!shift.closed_at || !shift.summary) {
    httpError(409, 'shift_not_closed', 'El turno sigue abierto. Ciérralo para imprimir el corte');
  }

  const dedupeKey = `corte:${shift.id}`;
  const sameKey = () => ctx.svc.entities.PrintJob.filter({ tenant_id: ctx.tenantId, dedupe_key: dedupeKey });

  const existing = pickSurvivor(await sameKey());
  if (existing) return { job: existing };

  const created = await ctx.svc.entities.PrintJob.create({
    tenant_id: ctx.tenantId,
    kind: 'corte',
    title: `Corte ${formatLocalDateTime(shift.closed_at, BAR_UTC_OFFSET_MIN).slice(0, 10)}`,
    lines: corteLines(ctx, shift),
    source_id: shift.id,
    dedupe_key: dedupeKey,
    status: 'pendiente',
    attempts: 0,
  });

  // Re-read: if a concurrent call created one too, the oldest survives and a
  // loser removes only its own (never-printed) row.
  const survivor = pickSurvivor(await sameKey()) ?? created;
  if (survivor.id !== created.id) {
    await ctx.svc.entities.PrintJob.delete(created.id);
  }
  return { job: survivor };
};

// attendance.correct: fix a mark with a mandatory note. Guard order:
// loadOwned -> permission -> billing gate -> validate -> write.
import { loadOwned, requirePermission, requireWritable, type Ctx, type Route } from '../_guard.ts';
import { buildCorrection } from './_logic.ts';
import { guardLogic, viewRecord } from './_shared.ts';

export const correct: Route = async (ctx: Ctx, body: any) => {
  const rec = await loadOwned(ctx, 'Attendance', typeof body?.record_id === 'string' ? body.record_id : '');
  await requirePermission(ctx, 'Asistencia:corregir');
  requireWritable(ctx);

  const nowMs = Date.now();
  const patch = guardLogic(() =>
    buildCorrection(
      rec,
      { clock_in: body?.clock_in, clock_out: body?.clock_out, note: body?.note },
      String(ctx.user.email ?? ''),
      nowMs
    )
  );
  const record = await ctx.svc.entities.Attendance.update(rec.id, patch);
  return { record: viewRecord(record, nowMs) };
};

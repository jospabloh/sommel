// printing.markFailed: only the claiming device; `retry` puts it back.
import { loadOwned, requirePermission, requireWritable, HttpError, type Ctx, type Route } from '../_guard.ts';
import { LogicError, decideMark, normalizeError, validateDeviceId } from './_logic.ts';

export const markFailed: Route = async (ctx: Ctx, body: any) => {
  const job = await loadOwned(ctx, 'PrintJob', body?.job_id);
  await requirePermission(ctx, 'Impresion:operar');
  requireWritable(ctx);

  try {
    const deviceId = validateDeviceId(body?.device_id);
    if (decideMark(job, deviceId, 'fallido') === 'noop') return { job };
  } catch (err) {
    if (err instanceof LogicError) throw new HttpError(err.status, err.code, err.message);
    throw err;
  }

  const updated = await ctx.svc.entities.PrintJob.update(job.id, {
    status: 'fallido',
    error: normalizeError(body?.error),
  });
  return { job: updated };
};

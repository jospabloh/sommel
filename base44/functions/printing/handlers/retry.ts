// printing.retry: `fallido` goes back to `pendiente`. The claim is cleared so
// any station may take it; `attempts` is kept as history.
import { loadOwned, requirePermission, requireWritable, HttpError, type Ctx, type Route } from '../_guard.ts';
import { LogicError, assertRetryable } from './_logic.ts';

export const retry: Route = async (ctx: Ctx, body: any) => {
  const job = await loadOwned(ctx, 'PrintJob', body?.job_id);
  await requirePermission(ctx, 'Impresion:operar');
  requireWritable(ctx);

  try {
    assertRetryable(job);
  } catch (err) {
    if (err instanceof LogicError) throw new HttpError(err.status, err.code, err.message);
    throw err;
  }

  const updated = await ctx.svc.entities.PrintJob.update(job.id, {
    status: 'pendiente',
    claimed_by: '',
    claimed_at: null,
    error: '',
  });
  return { job: updated };
};

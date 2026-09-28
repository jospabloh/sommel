// printing.reprint: an explicit, human-triggered copy. Creates a NEW job with
// `reprint_of`, the same lines and `dedupe_key = reprint:<job_id>:<n>`.
// Nothing here runs by itself; the station never reprints on reconnect.
import { loadOwned, requirePermission, requireWritable, pickSurvivor, HttpError, type Ctx, type Route } from '../_guard.ts';
import { DUPLICATE_MARK, LogicError, assertReprintable, nextReprintKey, reprintTitle } from './_logic.ts';

export const reprint: Route = async (ctx: Ctx, body: any) => {
  const source = await loadOwned(ctx, 'PrintJob', body?.job_id);
  await requirePermission(ctx, 'Impresion:operar');
  requireWritable(ctx);

  try {
    assertReprintable(source);
  } catch (err) {
    if (err instanceof LogicError) throw new HttpError(err.status, err.code, err.message);
    throw err;
  }

  const jobsOf = ctx.svc.entities.PrintJob;
  const previous = await jobsOf.filter({ tenant_id: ctx.tenantId, reprint_of: source.id });
  const dedupeKey = nextReprintKey(source.id, previous.map((j: any) => j.dedupe_key));

  const created = await jobsOf.create({
    tenant_id: ctx.tenantId,
    kind: source.kind,
    title: reprintTitle(source.title, source.kind),
    lines: source.lines ?? [],
    source_id: source.source_id,
    dedupe_key: dedupeKey,
    reprint_of: source.id,
    status: 'pendiente',
    attempts: 0,
  });

  // Re-read by key; two people pressing at once collapse to one copy.
  const rows = await jobsOf.filter({ tenant_id: ctx.tenantId, dedupe_key: dedupeKey });
  const survivor = pickSurvivor(rows) ?? created;
  for (const row of rows) {
    if (row.id !== survivor.id && row.status === 'pendiente') {
      await jobsOf.update(row.id, { status: 'fallido', error: DUPLICATE_MARK });
    }
  }
  return { job: survivor };
};

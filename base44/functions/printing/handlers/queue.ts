// printing.queue: pending, claimed and failed jobs; with `include_done` also
// the last 20 printed. Read only: no billing gate (contract §5).
import { requirePermission, type Ctx, type Route } from '../_guard.ts';
import { DONE_LIMIT, isVisibleFailure, orderQueue } from './_logic.ts';

const OPEN_LIMIT = 100;

export const queue: Route = async (ctx: Ctx, body: any) => {
  await requirePermission(ctx, 'Impresion:operar');

  const jobsOf = ctx.svc.entities.PrintJob;
  const [pending, claimed, failed] = await Promise.all([
    jobsOf.filter({ tenant_id: ctx.tenantId, status: 'pendiente' }, 'created_date', OPEN_LIMIT),
    jobsOf.filter({ tenant_id: ctx.tenantId, status: 'reclamado' }, 'created_date', OPEN_LIMIT),
    jobsOf.filter({ tenant_id: ctx.tenantId, status: 'fallido' }, '-created_date', OPEN_LIMIT),
  ]);

  const jobs = orderQueue([...pending, ...claimed, ...failed.filter(isVisibleFailure)]);

  if (body?.include_done) {
    const done = await jobsOf.filter({ tenant_id: ctx.tenantId, status: 'impreso' }, '-printed_at', DONE_LIMIT);
    const recent = done
      .slice()
      .sort((a: any, b: any) => String(b.printed_at ?? '').localeCompare(String(a.printed_at ?? '')))
      .slice(0, DONE_LIMIT);
    return { jobs: [...jobs, ...recent] };
  }
  return { jobs };
};

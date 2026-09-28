// printing.claimNext: the oldest `pendiente` job (or a `reclamado` one gone
// stale, > 2 min) is claimed by this device, then RE-READ. Two stations can
// write at once and the last write stands, so a device that no longer holds
// the claim answers `{ job: null }` and simply polls again (contract §5).
import { requirePermission, requireWritable, HttpError, type Ctx, type Route } from '../_guard.ts';
import { LogicError, didWinClaim, pickNextClaimable, validateDeviceId } from './_logic.ts';

const SCAN_LIMIT = 50;

export const claimNext: Route = async (ctx: Ctx, body: any) => {
  await requirePermission(ctx, 'Impresion:operar');
  requireWritable(ctx);

  let deviceId: string;
  try {
    deviceId = validateDeviceId(body?.device_id);
  } catch (err) {
    if (err instanceof LogicError) throw new HttpError(err.status, err.code, err.message);
    throw err;
  }

  const jobsOf = ctx.svc.entities.PrintJob;
  const [pending, claimed] = await Promise.all([
    jobsOf.filter({ tenant_id: ctx.tenantId, status: 'pendiente' }, 'created_date', SCAN_LIMIT),
    jobsOf.filter({ tenant_id: ctx.tenantId, status: 'reclamado' }, 'created_date', SCAN_LIMIT),
  ]);
  const candidate = pickNextClaimable([...pending, ...claimed], Date.now());
  if (!candidate) return { job: null };

  await jobsOf.update(candidate.id, {
    status: 'reclamado',
    claimed_by: deviceId,
    claimed_at: new Date().toISOString(),
    attempts: (candidate.attempts ?? 0) + 1,
    error: '',
  });

  const [reread] = await jobsOf.filter({ id: candidate.id });
  if (!didWinClaim(reread, deviceId)) return { job: null };
  return { job: reread };
};

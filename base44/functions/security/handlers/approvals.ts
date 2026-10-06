// security.approvers: who can approve right now (any member of the bar asks,
// since staff is the one who needs it). security.listApprovals: the log, for
// admins with Seguridad:ver.
import { httpError, personName, type Ctx, type Route } from '../_guard.ts';
import { approverList } from '../_approval_logic.ts';
import { requireSecurityViewer } from './_shared.ts';

const LIST_LIMIT = 200;
const FORGOTTEN_MS = 16 * 60 * 60_000;

export const approvers: Route = async (ctx: Ctx) => {
  if (!ctx.tenantId) httpError(403, 'no_tenant', 'No perteneces a ningún bar');
  const tenantId = ctx.tenantId as string;
  const nowMs = Date.now();
  const [users, pins, open] = await Promise.all([
    ctx.svc.entities.User.filter({ tenant_id: tenantId }),
    ctx.svc.entities.StaffPin.filter({ tenant_id: tenantId }),
    ctx.svc.entities.Attendance.filter({ tenant_id: tenantId, clock_out: null }, '-clock_in', 200).catch(() => []),
  ]);
  const onShift = new Set<string>(
    open
      .filter((r: any) => !r.clock_out && r.clock_in && nowMs - Date.parse(r.clock_in) <= FORGOTTEN_MS)
      .map((r: any) => r.user_id)
  );
  const list = approverList(users, {
    tenantId,
    requesterId: ctx.self?.id ?? '',
    withPin: new Set(pins.map((p: any) => p.user_id)),
    onShift,
    nameOf: personName,
  });
  return { approvers: list, qr_enabled: ctx.bar?.approval_qr_enabled === true };
};

export const listApprovals: Route = async (ctx: Ctx) => {
  const tenantId = await requireSecurityViewer(ctx);
  const rows = await ctx.svc.entities.ApprovalLog.filter({ tenant_id: tenantId }, '-created_at', LIST_LIMIT);
  return {
    approvals: rows.map((r: any) => ({
      id: r.id,
      action: r.action,
      detail: r.detail ?? '',
      requested_by_name: r.requested_by_name ?? '',
      approved_by_name: r.approved_by_name ?? '',
      method: r.method,
      created_at: r.created_at,
    })),
  };
};

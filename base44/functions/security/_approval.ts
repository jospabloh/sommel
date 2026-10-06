// Manager approval: the check every gated action runs right BEFORE it writes.
// Canonical template (scripts/generate-guards.mjs copies it, with _pin.ts and
// _approval_logic.ts, into APPROVAL_TARGET_DIRS). Edit this file, never the copies.
//
// Flow: a staff call without `approval` gets 403 `approval_required`; the app
// asks for an admin and their PIN and repeats the same call with
// `approval: { approver_id, pin }`. Nothing was written by the first call, so
// repeating it is safe. After the write, `recordApproval` leaves an
// ApprovalLog row (who asked, who approved, what).
import { HttpError, httpError, personName, type Ctx } from './_guard.ts';
import { verifyPin } from './_pin.ts';
import {
  APPROVAL_LABELS,
  isApprover,
  lockMinutesLeft,
  needsApproval,
  parseApproval,
  registerFailure,
  type ApprovalAction,
} from './_approval_logic.ts';

export interface ApprovalStamp {
  action: ApprovalAction;
  approved_by_id: string;
  approved_by_name: string;
  method: 'pin';
}

/** Null when no approval is needed (an admin is acting). Throws until a valid one arrives. */
export async function requireApproval(ctx: Ctx, body: any, action: ApprovalAction): Promise<ApprovalStamp | null> {
  if (!needsApproval(ctx.appRole, ctx.isPlatform)) return null;
  const label = APPROVAL_LABELS[action];
  const approval = parseApproval(body?.approval);
  if (!approval) {
    httpError(403, 'approval_required', `${label} necesita la aprobación de un administrador`, { approval_action: action, approval_label: label });
  }

  const [approver] = await ctx.svc.entities.User.filter({ id: approval!.approverId });
  if (!isApprover(approver, ctx.tenantId, ctx.self?.id)) {
    httpError(403, 'approver_invalid', 'Solo un administrador del bar puede aprobar');
  }
  const [pinRow] = await ctx.svc.entities.StaffPin.filter({ tenant_id: ctx.tenantId, user_id: approver.id });
  if (!pinRow) httpError(409, 'approver_no_pin', 'Ese administrador todavía no crea su PIN');

  const nowMs = Date.now();
  const left = lockMinutesLeft(pinRow.locked_until, nowMs);
  if (left > 0) httpError(423, 'pin_locked', `Demasiados intentos. Vuelve a intentar en ${left} min`, { minutes_left: left });

  if (!(await verifyPin(approval!.pin, pinRow.salt, pinRow.pin_hash))) {
    // Re-read right before writing, same as the checador: a parallel miss that
    // already locked the PIN wins.
    const [fresh] = await ctx.svc.entities.StaffPin.filter({ id: pinRow.id });
    const row = fresh ?? pinRow;
    const nowLeft = lockMinutesLeft(row.locked_until, nowMs);
    if (nowLeft > 0) httpError(423, 'pin_locked', `Demasiados intentos. Vuelve a intentar en ${nowLeft} min`, { minutes_left: nowLeft });
    await ctx.svc.entities.StaffPin.update(pinRow.id, registerFailure(Math.max(row.failed_attempts ?? 0, pinRow.failed_attempts ?? 0), nowMs));
    throw new HttpError(401, 'approval_wrong_pin', 'PIN del administrador incorrecto');
  }
  if ((pinRow.failed_attempts ?? 0) !== 0 || pinRow.locked_until) {
    await ctx.svc.entities.StaffPin.update(pinRow.id, { failed_attempts: 0, locked_until: null });
  }
  return { action, approved_by_id: approver.id, approved_by_name: personName(approver), method: 'pin' };
}

/** Leaves the ApprovalLog row after the write. Never fails the action that already happened. */
export async function recordApproval(ctx: Ctx, stamp: ApprovalStamp | null, info: { targetId?: string | null; detail?: string }): Promise<void> {
  if (!stamp) return;
  try {
    await ctx.svc.entities.ApprovalLog.create({
      tenant_id: ctx.tenantId,
      action: stamp.action,
      target_id: info.targetId ?? null,
      detail: (info.detail ?? '').slice(0, 300),
      requested_by_id: ctx.self?.id ?? null,
      requested_by_name: personName(ctx.self),
      approved_by_id: stamp.approved_by_id,
      approved_by_name: stamp.approved_by_name,
      method: stamp.method,
      terminal_id: ctx.terminal?.device?.id ?? null,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('recordApproval failed', (err as Error).message);
  }
}

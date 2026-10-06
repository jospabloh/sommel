// Manager approval (2026-10-06): the decisions, no imports so Deno tests load
// it offline. Canonical template: scripts/generate-guards.mjs copies it into
// every group in APPROVAL_TARGET_DIRS. Edit this file, never the copies.
//
// Decided by José: five actions need it (cancel a sent line, void a payment,
// cash out, close the shift, and a discount or comp, added the same day) and
// only the bar's admins approve. The default
// method is the admin's PIN (the same PIN as the checador and the terminal).

export type ApprovalAction = 'cancel_sent_item' | 'void_payment' | 'cash_out' | 'close_shift' | 'discount';

export const APPROVAL_LABELS: Record<ApprovalAction, string> = {
  cancel_sent_item: 'Cancelar un platillo ya enviado',
  void_payment: 'Anular un pago',
  cash_out: 'Retiro de efectivo',
  close_shift: 'Cerrar el turno',
  discount: 'Un descuento o cortesía',
};

/** Same lockout as the checador: 5 misses lock that PIN for 15 minutes. */
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;
const MIN_MS = 60_000;

/** Admins (and the platform) act without asking anyone. */
export function needsApproval(appRole: string | null | undefined, isPlatform: boolean): boolean {
  if (isPlatform) return false;
  return appRole !== 'bar_admin';
}

export function isValidPin(pin: unknown): pin is string {
  return typeof pin === 'string' && /^\d{4,6}$/.test(pin);
}

export type ParsedApproval =
  | { method: 'pin'; approverId: string; pin: string }
  | { method: 'passkey'; requestId: string };

/** The approval the client sent, or null when there is none or it is malformed. */
export function parseApproval(raw: unknown): ParsedApproval | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.request_id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(r.request_id)) {
    return { method: 'passkey', requestId: r.request_id };
  }
  const approverId = typeof r.approver_id === 'string' ? r.approver_id : '';
  if (!approverId || !isValidPin(r.pin)) return null;
  return { method: 'pin', approverId, pin: r.pin as string };
}

/** After an admin approved on the phone, the action must run within this long. */
export const APPROVED_GRACE_MS = 2 * 60_000;

/**
 * Why an approval made from the phone cannot be used for this action, or null
 * when it can. It must be for THIS bar, THIS action, asked by THIS person,
 * approved, not yet used, and fresh.
 */
export function phoneApprovalProblem(
  row: { tenant_id?: string; kind?: string; action?: string | null; requested_by_id?: string; status?: string; decided_at?: string | null } | null | undefined,
  opts: { tenantId: string | null; action: ApprovalAction; requesterId: string | null | undefined; nowMs: number }
): string | null {
  if (!row || row.tenant_id !== opts.tenantId || row.kind !== 'approve') return 'approval_not_found';
  if (row.action !== opts.action || row.requested_by_id !== opts.requesterId) return 'approval_mismatch';
  if (row.status === 'used') return 'approval_used';
  if (row.status !== 'approved') return 'approval_not_approved';
  const decided = Date.parse(row.decided_at ?? '');
  if (Number.isNaN(decided) || opts.nowMs - decided > APPROVED_GRACE_MS) return 'approval_expired';
  return null;
}

/** Only an admin of THIS bar approves; never a terminal account, never the person asking. */
export function isApprover(
  user: { id?: string; tenant_id?: string | null; app_role?: string | null } | null | undefined,
  tenantId: string | null | undefined,
  requesterId: string | null | undefined
): boolean {
  return !!user && !!tenantId && user.tenant_id === tenantId && user.app_role === 'bar_admin' && user.id !== requesterId;
}

export function lockMinutesLeft(lockedUntil: string | null | undefined, nowMs: number): number {
  if (!lockedUntil) return 0;
  const until = Date.parse(lockedUntil);
  if (Number.isNaN(until) || until <= nowMs) return 0;
  return Math.ceil((until - nowMs) / MIN_MS);
}

export function registerFailure(
  failedAttempts: number | null | undefined,
  nowMs: number
): { failed_attempts: number; locked_until: string | null } {
  const next = (Number.isInteger(failedAttempts) && (failedAttempts as number) > 0 ? (failedAttempts as number) : 0) + 1;
  if (next >= MAX_FAILED_ATTEMPTS) {
    return { failed_attempts: 0, locked_until: new Date(nowMs + LOCK_MINUTES * MIN_MS).toISOString() };
  }
  return { failed_attempts: next, locked_until: null };
}

/** Admins to offer in the approval dialog: on shift first, then by name. */
export function approverList(
  users: Array<{ id: string; tenant_id?: string | null; app_role?: string | null; display_name?: string | null; full_name?: string | null; email?: string | null }>,
  opts: { tenantId: string; requesterId: string; withPin: Set<string>; onShift: Set<string>; nameOf: (u: any) => string }
): Array<{ id: string; name: string; on_shift: boolean; has_pin: boolean }> {
  return users
    .filter((u) => isApprover(u, opts.tenantId, opts.requesterId))
    .map((u) => ({ id: u.id, name: opts.nameOf(u), on_shift: opts.onShift.has(u.id), has_pin: opts.withPin.has(u.id) }))
    .sort((a, b) => Number(b.on_shift) - Number(a.on_shift) || a.name.localeCompare(b.name, 'es'));
}

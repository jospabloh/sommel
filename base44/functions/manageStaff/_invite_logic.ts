// Pure logic for manageStaff's pending-invitation flow (módulo 19/22, fix
// 2026-09-28). ZERO imports on purpose — same reasoning as
// scripts/templates/_guard_logic.ts and StockFlow's machinery_sales_fields_test.ts:
// deno.land/jsr.io are blocked in this sandbox, so a file with no imports at
// all is the only kind `deno test` can run here without CI.

export const INVITE_TTL_DAYS = 14;

export type InviteStatus = 'pending' | 'accepted' | 'revoked';
export type AppRole = 'staff' | 'bar_admin';

export interface StaffInviteRow {
  id: string;
  tenant_id: string;
  email: string;
  app_role?: AppRole;
  status: InviteStatus;
  expires_at?: string | null;
  created_date?: string | null;
}

/** Trims and lowercases an email exactly once, for storage and for lookup. */
export function normalizeEmail(raw: unknown): string {
  return (typeof raw === 'string' ? raw : '').trim().toLowerCase();
}

/** ISO timestamp `days` days from `now` (defaults to `new Date()` — callers pass a fixed Date in tests). */
export function expiryFrom(now: Date, days: number = INVITE_TTL_DAYS): string {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

export function isExpired(row: Pick<StaffInviteRow, 'expires_at'>, now: Date): boolean {
  if (!row.expires_at) return false; // no expiry recorded => never expired
  const t = Date.parse(row.expires_at);
  if (Number.isNaN(t)) return false;
  return t <= now.getTime();
}

/**
 * True when `row` is a live invite: status pending and not expired.
 * `now` is explicit (not `new Date()`) so this stays a pure function callers
 * (and tests) can feed a fixed clock into.
 */
export function isLiveInvite(row: Pick<StaffInviteRow, 'status' | 'expires_at'>, now: Date): boolean {
  return row.status === 'pending' && !isExpired(row, now);
}

/**
 * Picks which pending, non-expired invite a claiming user should accept, out
 * of every StaffInvite row matching their stored email (across ALL tenants —
 * a person could in principle have been invited by more than one bar before
 * ever accepting either). Returns `null` when there is nothing live to claim.
 *
 * Selection: the most recently created row among the live candidates
 * (`created_date`, falling back to string id compare so the choice is still
 * deterministic if two rows share a timestamp — same "deterministic
 * survivor" shape as StockFlow's `pickSurvivor`).
 */
export function chooseInviteToClaim(rows: StaffInviteRow[], now: Date): StaffInviteRow | null {
  const live = rows.filter((r) => isLiveInvite(r, now));
  if (live.length === 0) return null;
  return live.reduce((best, row) => (compareRecency(row, best) > 0 ? row : best));
}

/** > 0 when `a` is more recent than `b`. */
function compareRecency(a: StaffInviteRow, b: StaffInviteRow): number {
  const ta = a.created_date ? Date.parse(a.created_date) : NaN;
  const tb = b.created_date ? Date.parse(b.created_date) : NaN;
  if (!Number.isNaN(ta) && !Number.isNaN(tb) && ta !== tb) return ta - tb;
  if (!Number.isNaN(ta) && Number.isNaN(tb)) return 1;
  if (Number.isNaN(ta) && !Number.isNaN(tb)) return -1;
  return a.id > b.id ? 1 : a.id < b.id ? -1 : 0;
}

/**
 * Every OTHER live candidate besides the one chosen — these get revoked once
 * the chosen one is accepted, so a person never ends up with two pending
 * invites to two different bars after joining one of them.
 */
export function inviteIdsToRevoke(rows: StaffInviteRow[], chosen: StaffInviteRow, now: Date): string[] {
  return rows
    .filter((r) => r.id !== chosen.id && isLiveInvite(r, now))
    .map((r) => r.id);
}

/**
 * Whether `invite` (an existing StaffInvite row) requires only a refresh of
 * expires_at (same tenant+email, already pending/not-yet-expired-enough-to-
 * matter — refreshing is always safe/idempotent) rather than a brand new
 * row. Returns true whenever a pending row for that tenant+email already
 * exists, regardless of whether it happens to still be live — re-inviting
 * revives it instead of stacking a duplicate.
 */
export function shouldRefreshExistingInvite<T extends Pick<StaffInviteRow, 'tenant_id' | 'email' | 'status'>>(
  existing: T | null | undefined,
  tenantId: string,
  email: string
): existing is T {
  return !!existing && existing.tenant_id === tenantId && existing.email === email && existing.status === 'pending';
}

/**
 * Role a claimed invite grants. Read from the STORED row and checked against a
 * whitelist here, so a row carrying anything else (a platform role, a typo, a
 * hand-edited value) degrades to the least privileged bar role instead of being
 * copied into User.app_role. Never a platform role.
 */
export function roleFromInvite(row: { app_role?: unknown } | null | undefined): AppRole {
  return row?.app_role === 'bar_admin' ? 'bar_admin' : 'staff';
}

/**
 * True when the bar an invite points at still exists and was not archived
 * (account.deleteBar). An invite to a gone bar must not attach anyone to it.
 */
export function isBarClaimable(bar: { archived_at?: string | null } | null | undefined): boolean {
  return !!bar && !bar.archived_at;
}

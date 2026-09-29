// Pure logic for the `session` endpoint (module 20). Zero imports so
// `deno test` loads it without deno.land/jsr.io.
//
// AppSession has TWO shapes on purpose (docs/estandar-plan.md, section 3):
//   - standard: user_id, device_id, device_name, status (active|passive|revoked),
//     last_seen;
//   - Mission Control's: revoked_at, revoked_by, last_active_at, device.
// Both stay. A row is revoked when EITHER says so, and both are written on
// revoke, so Mission Control's force-logout (which stamps only revoked_at)
// and this app's own revoke look the same to the heartbeat and the purge job.

export const SESSION_STALE_AFTER_MS = 48 * 60 * 60 * 1000;
export const MAX_DEVICE_NAME = 60;
export const DEFAULT_DEVICE_NAME = 'Dispositivo desconocido';

export type SessionStatus = 'active' | 'passive' | 'revoked';

export interface SessionRow {
  id?: string;
  user_id?: string | null;
  user_email?: string | null;
  user_name?: string | null;
  device_id?: string | null;
  device_name?: string | null;
  device?: string | null;
  status?: string | null;
  last_seen?: string | null;
  last_active_at?: string | null;
  started_at?: string | null;
  created_date?: string | null;
  revoked_at?: string | null;
  revoked_by?: string | null;
}

/** Revoked by either shape: the standard `status` or Mission Control's `revoked_at`. */
export function isRevoked(row: SessionRow | null | undefined): boolean {
  if (!row) return false;
  return row.status === 'revoked' || !!row.revoked_at;
}

/** The status a client should see: revoked wins, then the stored one, legacy rows count as active. */
export function effectiveStatus(row: SessionRow): SessionStatus {
  if (isRevoked(row)) return 'revoked';
  return row.status === 'passive' ? 'passive' : 'active';
}

function ms(value: unknown): number {
  if (typeof value !== 'string' || !value) return 0;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : 0;
}

/** Latest sign of life on a row, across both shapes; 0 when it has none. */
export function lastSignOfLifeMs(row: SessionRow): number {
  return Math.max(ms(row.last_seen), ms(row.last_active_at), ms(row.started_at), ms(row.created_date));
}

export function isStale(row: SessionRow, nowMs: number, thresholdMs = SESSION_STALE_AFTER_MS): boolean {
  const last = lastSignOfLifeMs(row);
  if (last === 0) return false; // never guess: no timestamp at all is not evidence of staleness
  return nowMs - last > thresholdMs;
}

/** device_id comes from the browser; accept only a sane opaque token. */
export function cleanDeviceId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return /^[A-Za-z0-9_-]{8,128}$/.test(v) ? v : null;
}

export function cleanDeviceName(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_DEVICE_NAME;
  const v = value.replace(/\s+/g, ' ').trim().slice(0, MAX_DEVICE_NAME);
  return v || DEFAULT_DEVICE_NAME;
}

function createdMs(row: SessionRow): number {
  return ms(row.created_date) || ms(row.started_at);
}

/** Deterministic survivor when a double mount created two rows for one device: oldest, id tiebreak. */
export function pickSessionSurvivor<T extends SessionRow>(rows: T[]): T | null {
  if (rows.length === 0) return null;
  return [...rows].sort((a, b) => {
    const d = createdMs(a) - createdMs(b);
    if (d !== 0) return d;
    return String(a.id ?? '').localeCompare(String(b.id ?? ''));
  })[0];
}

export interface ManagePlan {
  existingId: string | null;
  demoteIds: string[];
}

/**
 * manageSession: reuse this device's live row (a revoked row never blocks a
 * fresh login) and demote every OTHER active session of the user to passive.
 */
export function planManage(userSessions: SessionRow[], deviceId: string): ManagePlan {
  const live = userSessions.filter((s) => !isRevoked(s));
  const mine = pickSessionSurvivor(live.filter((s) => s.device_id === deviceId));
  const demoteIds = live
    .filter((s) => s.id && s.id !== mine?.id && effectiveStatus(s) === 'active')
    .map((s) => s.id as string);
  return { existingId: mine?.id ?? null, demoteIds };
}

export type HeartbeatDecision = 'ok' | 'revoked' | 'not_found';

/** Ownership first (a foreign id is indistinguishable from a missing one), then revocation. */
export function heartbeatDecision(row: SessionRow | null | undefined, userId: string): HeartbeatDecision {
  if (!row || !row.user_id || row.user_id !== userId) return 'not_found';
  return isRevoked(row) ? 'revoked' : 'ok';
}

/** Heartbeat proves the tab is open: it moves last_seen for active AND passive rows. */
export function heartbeatPatch(nowIso: string) {
  return { last_seen: nowIso, last_active_at: nowIso };
}

export interface Caller {
  id: string;
  tenantId: string | null;
  appRole: string | null;
  isPlatform: boolean;
}

/**
 * revokeSession: your own sessions, or, for a bar_admin, those of a member of
 * the SAME bar (compared against the target user's STORED tenant_id, never a
 * value from the body). Anything else answers as missing, no existence oracle.
 */
export function canRevoke(
  caller: Caller,
  row: SessionRow | null | undefined,
  targetUserTenantId: string | null | undefined,
): boolean {
  if (!row || !row.user_id) return false;
  if (row.user_id === caller.id) return true;
  if (caller.isPlatform) return true;
  return caller.appRole === 'bar_admin' && !!caller.tenantId && targetUserTenantId === caller.tenantId;
}

export function revokePatchFor(nowIso: string, actor: string) {
  return { status: 'revoked' as const, revoked_at: nowIso, revoked_by: actor };
}

/** Flat, minimal projection for the settings list. No device_id: the client only needs is_current. */
export function toPublicSession(row: SessionRow, currentDeviceId: string | null, opts: { withUser?: boolean } = {}) {
  const last = lastSignOfLifeMs(row);
  return {
    id: row.id,
    status: effectiveStatus(row),
    device_name: row.device_name || row.device || DEFAULT_DEVICE_NAME,
    last_seen: last ? new Date(last).toISOString() : null,
    started_at: row.started_at ?? row.created_date ?? null,
    is_current: !!currentDeviceId && row.device_id === currentDeviceId,
    ...(opts.withUser ? { user_id: row.user_id ?? null, user_name: row.user_name ?? null, user_email: row.user_email ?? null } : {}),
  };
}

export function sortByLastSeenDesc<T extends SessionRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => lastSignOfLifeMs(b) - lastSignOfLifeMs(a));
}

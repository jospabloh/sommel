// Pure logic for `purgeStaleSessions` (module 20, layer 3). Zero imports.
// The row helpers mirror session/_session_logic.ts (Deno cannot import across
// function directories); base44/tests/session_logic_test.ts asserts the two
// copies agree.

export const STALE_AFTER_MS = 48 * 60 * 60 * 1000; // portfolio default, module 20

export interface PurgeRow {
  id?: string;
  status?: string | null;
  last_seen?: string | null;
  last_active_at?: string | null;
  started_at?: string | null;
  created_date?: string | null;
  revoked_at?: string | null;
}

function ms(value: unknown): number {
  if (typeof value !== 'string' || !value) return 0;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : 0;
}

export function rowRevoked(row: PurgeRow): boolean {
  return row.status === 'revoked' || !!row.revoked_at;
}

export function rowStale(row: PurgeRow, nowMs: number, thresholdMs = STALE_AFTER_MS): boolean {
  const last = Math.max(ms(row.last_seen), ms(row.last_active_at), ms(row.started_at), ms(row.created_date));
  if (last === 0) return false;
  return nowMs - last > thresholdMs;
}

/** Both active AND passive rows are reaped; already revoked ones are left alone. */
export function selectStale<T extends PurgeRow>(rows: T[], nowMs: number, thresholdMs = STALE_AFTER_MS): T[] {
  return rows.filter((r) => !rowRevoked(r) && rowStale(r, nowMs, thresholdMs));
}

export function purgePatch(nowIso: string) {
  return { status: 'revoked' as const, revoked_at: nowIso, revoked_by: 'purgeStaleSessions' };
}

/** Constant-time string compare (length leak only). */
export function safeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export interface CronVerdict {
  ok: boolean;
  status: number;
  code: string;
}

/**
 * Fails CLOSED (module 16): an unset or blank CRON_SECRET answers 503 and the
 * job never runs; a wrong or missing bearer answers 401. The x-vercel-cron
 * style "trust a header the caller controls" shortcut is deliberately absent.
 */
export function cronVerdict(secret: string | null | undefined, authorization: string | null | undefined): CronVerdict {
  if (!secret || !secret.trim()) return { ok: false, status: 503, code: 'cron_not_configured' };
  const expected = `Bearer ${secret}`;
  if (typeof authorization !== 'string' || !safeEqual(authorization, expected)) {
    return { ok: false, status: 401, code: 'unauthorized' };
  }
  return { ok: true, status: 200, code: 'ok' };
}

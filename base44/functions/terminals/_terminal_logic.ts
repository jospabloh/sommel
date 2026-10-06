// Pure rules for the `terminals` function (terminal mode, phase 2a).
// Import-free so base44/tests/terminals_logic_test.ts runs it in the sandbox.

export class LogicError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

// Same values as attendance/handlers/_logic.ts (the test compares them): a
// PIN locks after the same number of misses whether it is typed at the
// checador or at a terminal.
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;
export const FORGOTTEN_HOURS = 16;
/** Misses across ALL people at one terminal before the terminal itself locks:
 *  without it, N people × 5 tries each is N times the guesses per 15 minutes. */
export const DEVICE_MAX_FAILED_UNLOCKS = 10;
const MIN_MS = 60_000;

/** Domain with no mailbox for terminal accounts: nobody reads mail there. */
export const TERMINAL_EMAIL_DOMAIN = 'terminales.acaciaco.com.mx';

export function terminalEmail(randomPart: string): string {
  return `t-${randomPart}@${TERMINAL_EMAIL_DOMAIN}`;
}

export function validateTerminalName(name: unknown): string {
  const v = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : '';
  if (v.length < 1 || v.length > 40) throw new LogicError('invalid_name', 'Ponle un nombre de 1 a 40 letras, por ejemplo Caja');
  return v;
}

/**
 * Who may use the terminal. `people` keeps only ids that are real members of
 * the bar with a bar role; an empty list is refused (nobody could unlock it).
 */
export function normalizeAllowed(
  input: unknown,
  memberIds: Set<string>
): { mode: 'all' } | { mode: 'people'; user_ids: string[] } {
  const a = input as { mode?: unknown; user_ids?: unknown } | null | undefined;
  if (!a || a.mode !== 'people') return { mode: 'all' };
  const ids = Array.isArray(a.user_ids) ? [...new Set(a.user_ids.filter((x) => typeof x === 'string'))] : [];
  const kept = ids.filter((id) => memberIds.has(id as string)) as string[];
  if (kept.length === 0) throw new LogicError('invalid_allowed', 'Elige al menos una persona que pueda usar esta terminal');
  return { mode: 'people', user_ids: kept };
}

export function isValidPin(pin: unknown): pin is string {
  return typeof pin === 'string' && /^\d{4,6}$/.test(pin);
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

/** Device-wide counter after a wrong PIN at this terminal. */
export function registerDeviceFailure(
  failedUnlocks: number | null | undefined,
  nowMs: number
): { failed_unlocks: number; unlock_locked_until: string | null } {
  const next = (Number.isInteger(failedUnlocks) && (failedUnlocks as number) > 0 ? (failedUnlocks as number) : 0) + 1;
  if (next >= DEVICE_MAX_FAILED_UNLOCKS) {
    return { failed_unlocks: 0, unlock_locked_until: new Date(nowMs + LOCK_MINUTES * MIN_MS).toISOString() };
  }
  return { failed_unlocks: next, unlock_locked_until: null };
}

export function displayName(
  user: { display_name?: string | null; full_name?: string | null; email?: string | null } | null | undefined
): string {
  const own = String(user?.display_name ?? '').trim();
  if (own) return own;
  const full = String(user?.full_name ?? '').trim();
  if (full) return full;
  const email = String(user?.email ?? '').trim();
  const at = email.indexOf('@');
  return (at > 0 ? email.slice(0, at) : email) || 'Sin nombre';
}

/** Open and not forgotten (an entrada left open for over 16 h does not count as "on shift"). */
export function isOnShift(rec: { clock_in?: string; clock_out?: string | null } | null | undefined, nowMs: number): boolean {
  if (!rec || rec.clock_out || !rec.clock_in) return false;
  const start = Date.parse(rec.clock_in);
  if (Number.isNaN(start)) return false;
  return nowMs - start <= FORGOTTEN_HOURS * 60 * MIN_MS;
}

export interface RosterPerson {
  id: string;
  name: string;
  app_role: string;
  on_shift: boolean;
  /** Shown as a button right away: on shift now, or an admin (always). */
  featured: boolean;
  /** The bar admin asked for a photo when this person unlocks (anti PIN-sharing). */
  photo_check: boolean;
}

/**
 * "¿Quién eres?" (docs/modo-terminal-diseno.md): only people of this bar,
 * with a bar role, on this terminal's list and with a PIN. On-shift people
 * and admins are featured; everyone else is still reachable ("Otra persona"),
 * so someone who forgot to punch in is never locked out.
 */
export function buildRoster(
  users: Array<{ id: string; display_name?: string | null; full_name?: string | null; email?: string | null; app_role?: string | null; tenant_id?: string | null; photo_check?: boolean | null }>,
  opts: { tenantId: string; allows: (id: string) => boolean; withPin: Set<string>; onShift: Set<string> }
): RosterPerson[] {
  return users
    .filter((u) => u.tenant_id === opts.tenantId)
    .filter((u) => u.app_role === 'bar_admin' || u.app_role === 'staff')
    .filter((u) => opts.allows(u.id) && opts.withPin.has(u.id))
    .map((u) => {
      const onShift = opts.onShift.has(u.id);
      return {
        id: u.id,
        name: displayName(u),
        app_role: u.app_role as string,
        on_shift: onShift,
        featured: onShift || u.app_role === 'bar_admin',
        photo_check: u.photo_check === true,
      };
    })
    .sort((a, b) => Number(b.featured) - Number(a.featured) || a.name.localeCompare(b.name, 'es'));
}

/** What the bar sees about a terminal: never the pass key nor the account email. */
export function publicDevice(row: any) {
  return {
    id: row?.id,
    name: row?.name,
    allowed: row?.allowed ?? { mode: 'all' },
    activated_by_name: row?.activated_by_name ?? null,
    created_date: row?.created_date ?? null,
    last_seen_at: row?.last_seen_at ?? null,
    revoked_at: row?.revoked_at ?? null,
    // Revoked but its Base44 account could not be deleted: "Desactivar" again.
    account_pending: !!row?.revoked_at && !row?.account_deleted_at,
  };
}

/** The session a Base44 embed sign-in redirect carries, or null. */
export function accessTokenFromLocation(location: string | null | undefined): string | null {
  if (!location) return null;
  try {
    return new URL(location, 'https://x.invalid').searchParams.get('access_token') || null;
  } catch {
    return null;
  }
}

/** last_seen_at is refreshed at most every 5 minutes, not on every call. */
export function shouldTouchLastSeen(lastSeenAt: string | null | undefined, nowMs: number): boolean {
  if (!lastSeenAt) return true;
  const t = Date.parse(lastSeenAt);
  return Number.isNaN(t) || nowMs - t > 5 * MIN_MS;
}

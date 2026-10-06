// Anti PIN-sharing checks (photo at unlock / punch, and security alerts).
// Canonical template: scripts/generate-guards.mjs copies it into every
// function group in SECURITY_TARGET_DIRS. Edit this file, never the copies.
//
// No imports on purpose: Deno tests load it in the sandbox, and the helpers
// that write take the service client as an argument.

/** Photos are deleted this many days after they were taken. */
export const PHOTO_RETENTION_DAYS = 30;
/** Alerts are deleted this many days after they were raised. */
export const ALERT_RETENTION_DAYS = 90;
/** A data URL longer than this is rejected (a 240 px JPEG is ~8 KB). */
export const MAX_PHOTO_CHARS = 80_000;
/** The same person unlocking a second terminal inside this window is an alert. */
export const TWO_TERMINALS_WINDOW_MIN = 10;
/** An unseen alert of the same kind for the same person is not repeated within this window. */
export const ALERT_DEDUPE_MIN = 60;
/** Off-shift unlocks only count for people who used the checador this recently. */
export const CHECADOR_IN_USE_DAYS = 14;
/** At most this many expired rows are deleted per call (cleanup is incremental). */
export const PURGE_BATCH = 25;

const MIN_MS = 60_000;
const DAY_MS = 24 * 60 * MIN_MS;

export type AlertKind = 'photo_missing' | 'two_terminals' | 'off_shift_unlock';
export type PhotoKind = 'unlock' | 'punch';

export interface AlertDraft {
  kind: AlertKind;
  detail: string;
}

const PHOTO_PREFIX = /^data:image\/(jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

/** The photo to keep, or null when it is missing or not a small JPEG/WebP data URL. */
export function validatePhoto(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  if (raw.length === 0 || raw.length > MAX_PHOTO_CHARS) return null;
  return PHOTO_PREFIX.test(raw) ? raw : null;
}

export function photoExpiry(nowMs: number): string {
  return new Date(nowMs + PHOTO_RETENTION_DAYS * DAY_MS).toISOString();
}

export function alertExpiry(nowMs: number): string {
  return new Date(nowMs + ALERT_RETENTION_DAYS * DAY_MS).toISOString();
}

/** Expired, or missing an expiry date (treated as expired so nothing lives forever). */
export function isExpired(row: { expires_at?: string | null } | null | undefined, nowMs: number): boolean {
  const t = Date.parse(row?.expires_at ?? '');
  return Number.isNaN(t) || t <= nowMs;
}

/** Whether this person must take a photo (set per person by the bar admin). */
export function photoRequired(person: { photo_check?: unknown } | null | undefined): boolean {
  return person?.photo_check === true;
}

/** Other terminals of the bar where this same person unlocked within the window. */
export function otherTerminalsInUse(
  devices: Array<{ id: string; name?: string; unlocked_user_id?: string | null; unlocked_at?: string | null; revoked_at?: string | null }>,
  opts: { userId: string; deviceId: string; nowMs: number }
): Array<{ id: string; name: string }> {
  return devices
    .filter((d) => d.id !== opts.deviceId && !d.revoked_at && d.unlocked_user_id === opts.userId)
    .filter((d) => {
      const t = Date.parse(d.unlocked_at ?? '');
      return !Number.isNaN(t) && opts.nowMs - t >= 0 && opts.nowMs - t <= TWO_TERMINALS_WINDOW_MIN * MIN_MS;
    })
    .map((d) => ({ id: d.id, name: d.name || 'otra terminal' }));
}

/** Whether the person punched in the checador recently (so it is in use for them). */
export function usesChecador(records: Array<{ clock_in?: string | null }>, nowMs: number): boolean {
  return records.some((r) => {
    const t = Date.parse(r?.clock_in ?? '');
    return !Number.isNaN(t) && nowMs - t <= CHECADOR_IN_USE_DAYS * DAY_MS;
  });
}

/** Alerts for a successful terminal unlock. */
export function unlockAlerts(input: {
  appRole: string;
  photoRequired: boolean;
  photoGiven: boolean;
  onShift: boolean;
  usesChecador: boolean;
  otherTerminals: Array<{ name: string }>;
  terminalName: string;
}): AlertDraft[] {
  const out: AlertDraft[] = [];
  if (input.photoRequired && !input.photoGiven) {
    out.push({ kind: 'photo_missing', detail: `Entró a la terminal ${input.terminalName} sin foto (sin cámara o sin permiso).` });
  }
  if (input.otherTerminals.length > 0) {
    const names = input.otherTerminals.map((t) => t.name).join(', ');
    out.push({
      kind: 'two_terminals',
      detail: `Entró a la terminal ${input.terminalName} mientras seguía activa en ${names} (menos de ${TWO_TERMINALS_WINDOW_MIN} min).`,
    });
  }
  // Admins work off the checador all the time; only staff is flagged.
  if (input.appRole === 'staff' && input.usesChecador && !input.onShift) {
    out.push({ kind: 'off_shift_unlock', detail: `Entró a la terminal ${input.terminalName} sin haber checado entrada.` });
  }
  return out;
}

/** Alerts for a successful punch. */
export function punchAlerts(input: { photoRequired: boolean; photoGiven: boolean; action: string }): AlertDraft[] {
  if (!input.photoRequired || input.photoGiven) return [];
  const what = input.action === 'salida' ? 'salida' : 'entrada';
  return [{ kind: 'photo_missing', detail: `Checó ${what} sin foto (sin cámara o sin permiso).` }];
}

/** Drops drafts that repeat an unseen alert of the same kind raised recently. */
export function dedupeAlerts(
  drafts: AlertDraft[],
  recent: Array<{ kind?: string; seen_at?: string | null; created_at?: string | null }>,
  nowMs: number
): AlertDraft[] {
  const fresh = new Set(
    recent
      .filter((a) => !a.seen_at)
      .filter((a) => {
        const t = Date.parse(a.created_at ?? '');
        return !Number.isNaN(t) && nowMs - t <= ALERT_DEDUPE_MIN * MIN_MS;
      })
      .map((a) => a.kind)
  );
  return drafts.filter((d) => !fresh.has(d.kind));
}

/** Expired rows of a page, capped at PURGE_BATCH. */
export function expiredIds(rows: Array<{ id: string; expires_at?: string | null }>, nowMs: number): string[] {
  return rows.filter((r) => isExpired(r, nowMs)).slice(0, PURGE_BATCH).map((r) => r.id);
}

// ---- Writers (service client passed in; every failure is swallowed so a
// missing photo or alert never blocks a punch or an unlock). ----

/** Deletes up to PURGE_BATCH expired rows of one bar. Returns how many went. */
// deno-lint-ignore no-explicit-any
export async function purgeExpired(svc: any, entity: 'PhotoCheck' | 'SecurityAlert', tenantId: string, nowMs: number): Promise<number> {
  try {
    const rows = await svc.entities[entity].filter({ tenant_id: tenantId }, 'expires_at', PURGE_BATCH * 2);
    let gone = 0;
    for (const id of expiredIds(rows ?? [], nowMs)) {
      try {
        await svc.entities[entity].delete(id);
        gone++;
      } catch { /* next call retries */ }
    }
    return gone;
  } catch {
    return 0;
  }
}

/** Stores a photo when this person requires one. Returns its id, or null. */
export async function savePhoto(
  // deno-lint-ignore no-explicit-any
  svc: any,
  input: { tenantId: string; person: any; personName: string; kind: PhotoKind; photo: string | null; terminalId?: string | null; terminalName?: string | null; attendanceId?: string | null; nowMs: number }
): Promise<string | null> {
  if (!photoRequired(input.person) || !input.photo) return null;
  try {
    const row = await svc.entities.PhotoCheck.create({
      tenant_id: input.tenantId,
      user_id: input.person.id,
      user_name: input.personName,
      kind: input.kind,
      image: input.photo,
      terminal_id: input.terminalId ?? null,
      terminal_name: input.terminalName ?? null,
      attendance_id: input.attendanceId ?? null,
      taken_at: new Date(input.nowMs).toISOString(),
      expires_at: photoExpiry(input.nowMs),
    });
    await purgeExpired(svc, 'PhotoCheck', input.tenantId, input.nowMs);
    return row?.id ?? null;
  } catch (err) {
    console.error('savePhoto failed', (err as Error).message);
    return null;
  }
}

/** Writes the alerts that are not repeats. Returns how many were written. */
export async function raiseAlerts(
  // deno-lint-ignore no-explicit-any
  svc: any,
  input: { tenantId: string; userId: string; userName: string; drafts: AlertDraft[]; terminalId?: string | null; photoId?: string | null; nowMs: number }
): Promise<number> {
  if (input.drafts.length === 0) return 0;
  try {
    const recent = await svc.entities.SecurityAlert.filter({ tenant_id: input.tenantId, user_id: input.userId }, '-created_at', 20).catch(() => []);
    const drafts = dedupeAlerts(input.drafts, recent ?? [], input.nowMs);
    let n = 0;
    for (const d of drafts) {
      try {
        await svc.entities.SecurityAlert.create({
          tenant_id: input.tenantId,
          user_id: input.userId,
          user_name: input.userName,
          kind: d.kind,
          detail: d.detail,
          terminal_id: input.terminalId ?? null,
          photo_id: input.photoId ?? null,
          created_at: new Date(input.nowMs).toISOString(),
          expires_at: alertExpiry(input.nowMs),
          seen_at: null,
        });
        n++;
      } catch (err) {
        console.error('raiseAlerts create failed', (err as Error).message);
      }
    }
    if (n > 0) await purgeExpired(svc, 'SecurityAlert', input.tenantId, input.nowMs);
    return n;
  } catch {
    return 0;
  }
}

// Pure logic for the `attendance` (checador) endpoint, contract section 3.
// ZERO imports on purpose (same reasoning as shifts/_logic.ts): `deno test`
// loads it offline. Handlers catch `LogicError` and re-throw as HttpError.
// Day ranges are turned into instants by the handler with `localDayRange`
// from the guard; this file only deals with instants and plain strings.

export class LogicError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export const DOUBLE_TAP_MS = 60_000;
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;
export const FORGOTTEN_HOURS = 16;
export const MAX_RANGE_DAYS = 62;
export const MAX_NOTE_LENGTH = 300;

const MIN_MS = 60_000;

export interface AttendanceLike {
  id?: string | null;
  user_id?: string | null;
  user_name?: string | null;
  clock_in: string;
  clock_out?: string | null;
  created_date?: string | null;
  edited_at?: string | null;
}

// ---------------------------------------------------------------------------
// PIN format, names
// ---------------------------------------------------------------------------

/** 4 to 6 digits, nothing else. */
export function isValidPin(pin: unknown): pin is string {
  return typeof pin === 'string' && /^\d{4,6}$/.test(pin);
}

export function validatePin(pin: unknown): string {
  if (!isValidPin(pin)) throw new LogicError('invalid_pin', 'El PIN debe tener de 4 a 6 números');
  return pin;
}

/** `full_name`, or the part of the email before the @. */
export function displayName(user: { full_name?: string | null; email?: string | null } | null | undefined): string {
  const full = String(user?.full_name ?? '').trim();
  if (full) return full;
  const email = String(user?.email ?? '').trim();
  const at = email.indexOf('@');
  const local = at > 0 ? email.slice(0, at) : email;
  return local || 'Sin nombre';
}

// ---------------------------------------------------------------------------
// Lockout
// ---------------------------------------------------------------------------

/** Whole minutes left of a lock (rounded up), 0 when not locked. */
export function lockMinutesLeft(lockedUntil: string | null | undefined, nowMs: number): number {
  if (!lockedUntil) return 0;
  const until = Date.parse(lockedUntil);
  if (Number.isNaN(until) || until <= nowMs) return 0;
  return Math.ceil((until - nowMs) / MIN_MS);
}

/**
 * State to store after a WRONG pin. The counter is best-effort under
 * concurrency (Base44 has no atomic increment): handlers re-read the row
 * right before writing (see `recordPinFailure` in _shared.ts), which narrows
 * but cannot fully close the parallel-guess window. The 5th consecutive failure locks for 15
 * minutes and restarts the counter.
 */
export function registerFailure(
  failedAttempts: number | null | undefined,
  nowMs: number
): { failed_attempts: number; locked_until: string | null; locked: boolean } {
  const next = (Number.isInteger(failedAttempts) && (failedAttempts as number) > 0 ? (failedAttempts as number) : 0) + 1;
  if (next >= MAX_FAILED_ATTEMPTS) {
    return { failed_attempts: 0, locked_until: new Date(nowMs + LOCK_MINUTES * MIN_MS).toISOString(), locked: true };
  }
  return { failed_attempts: next, locked_until: null, locked: false };
}

// ---------------------------------------------------------------------------
// Toggle decision
// ---------------------------------------------------------------------------

/** Instant of the last mark (entrada or salida) of a record, in ms. */
export function lastMarkMs(rec: AttendanceLike): number {
  const a = Date.parse(rec.clock_in);
  const b = rec.clock_out ? Date.parse(rec.clock_out) : NaN;
  return Math.max(Number.isNaN(a) ? -Infinity : a, Number.isNaN(b) ? -Infinity : b);
}

/** Open records of a person, oldest first. */
export function openRecords<T extends AttendanceLike>(records: T[]): T[] {
  return records
    .filter((r) => !r.clock_out)
    .sort((a, b) => Date.parse(a.clock_in) - Date.parse(b.clock_in) || String(a.id ?? '').localeCompare(String(b.id ?? '')));
}

export type PunchDecision<T> =
  | { kind: 'double_tap'; record: T; action: 'entrada' | 'salida' }
  | { kind: 'salida'; record: T }
  | { kind: 'entrada' };

/**
 * What a correct-PIN punch does. Double tap first: if the person's latest
 * mark (in or out) is under 60 s old, the same record comes back untouched.
 * Otherwise an open record gets closed, and with none a new one is opened.
 */
export function decidePunch<T extends AttendanceLike>(records: T[], nowMs: number): PunchDecision<T> {
  let latest: T | null = null;
  let latestMs = -Infinity;
  for (const r of records) {
    const m = lastMarkMs(r);
    if (m > latestMs) {
      latestMs = m;
      latest = r;
    }
  }
  if (latest && nowMs - latestMs >= 0 && nowMs - latestMs < DOUBLE_TAP_MS) {
    return { kind: 'double_tap', record: latest, action: latest.clock_out ? 'salida' : 'entrada' };
  }
  // A forgotten exit (open > 16 h) is NOT the record to close: closing it
  // would book a 17+ h shift and trap the next tap in the double-tap window.
  // A new entrada opens instead; the old mark stays open, flagged, for an
  // admin to correct.
  const open = openRecords(records).filter((r) => !isForgotten(r, nowMs));
  if (open.length > 0) return { kind: 'salida', record: open[0] };
  return { kind: 'entrada' };
}

// ---------------------------------------------------------------------------
// Forgotten exit, minutes, totals
// ---------------------------------------------------------------------------

/** An open record older than 16 h is a forgotten exit. */
export function isForgotten(rec: AttendanceLike, nowMs: number): boolean {
  if (rec.clock_out) return false;
  const start = Date.parse(rec.clock_in);
  if (Number.isNaN(start)) return false;
  return nowMs - start > FORGOTTEN_HOURS * 60 * MIN_MS;
}

/**
 * Whole minutes of a record, optionally clipped to [fromMs, toMs) so a shift
 * that crosses midnight (or the range edge) only counts what falls inside.
 * An open record runs to `nowMs`; a forgotten one counts 0 because its real
 * end is unknown (the panel asks for a correction instead of inventing hours).
 */
export function recordMinutes(
  rec: AttendanceLike,
  nowMs: number,
  clip?: { fromMs: number; toMs: number }
): number {
  if (isForgotten(rec, nowMs)) return 0;
  let start = Date.parse(rec.clock_in);
  let end = rec.clock_out ? Date.parse(rec.clock_out) : nowMs;
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  if (clip) {
    start = Math.max(start, clip.fromMs);
    end = Math.min(end, clip.toMs);
  }
  if (end <= start) return 0;
  return Math.floor((end - start) / MIN_MS);
}

/** Records that overlap [fromMs, toMs). */
export function overlapsRange(rec: AttendanceLike, nowMs: number, fromMs: number, toMs: number): boolean {
  const start = Date.parse(rec.clock_in);
  if (Number.isNaN(start)) return false;
  const end = rec.clock_out ? Date.parse(rec.clock_out) : Math.max(nowMs, start);
  return start < toMs && end > fromMs;
}

export interface PersonTotal {
  user_id: string;
  name: string;
  minutes: number;
  open: boolean;
}

/** Minutes per person, clipped to the range. `open` = still inside. */
export function totalsByPerson(
  records: AttendanceLike[],
  nowMs: number,
  clip: { fromMs: number; toMs: number }
): PersonTotal[] {
  const map = new Map<string, PersonTotal & { lastIn: number }>();
  for (const r of records) {
    const uid = String(r.user_id ?? '');
    if (!uid) continue;
    const inMs = Date.parse(r.clock_in);
    let t = map.get(uid);
    if (!t) {
      t = { user_id: uid, name: String(r.user_name ?? '') || 'Sin nombre', minutes: 0, open: false, lastIn: -Infinity };
      map.set(uid, t);
    }
    if (inMs > t.lastIn) {
      t.lastIn = inMs;
      if (r.user_name) t.name = String(r.user_name);
    }
    t.minutes += recordMinutes(r, nowMs, clip);
    if (!r.clock_out) t.open = true;
  }
  return [...map.values()]
    .map(({ lastIn: _l, ...rest }) => rest)
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

// ---------------------------------------------------------------------------
// Range and correction validation
// ---------------------------------------------------------------------------

function parseDate(s: unknown): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? ''));
  if (!m) throw new LogicError('invalid_date', 'Fecha inválida');
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const c = new Date(t);
  if (c.getUTCFullYear() !== Number(m[1]) || c.getUTCMonth() !== Number(m[2]) - 1 || c.getUTCDate() !== Number(m[3])) {
    throw new LogicError('invalid_date', 'Fecha inválida');
  }
  return t;
}

/** Local dates 'YYYY-MM-DD', from <= to, at most 62 days inclusive. */
export function validateDateRange(from: unknown, to: unknown): { from: string; to: string; days: number } {
  const f = parseDate(from);
  const t = parseDate(to);
  if (t < f) throw new LogicError('invalid_range', 'La fecha final no puede ser anterior a la inicial');
  const days = Math.round((t - f) / 86_400_000) + 1;
  if (days > MAX_RANGE_DAYS) throw new LogicError('range_too_long', `El rango puede ser de máximo ${MAX_RANGE_DAYS} días`);
  return { from: String(from), to: String(to), days };
}

export function normalizeNote(note: unknown): string {
  const n = typeof note === 'string' ? note.trim() : '';
  if (!n) throw new LogicError('note_required', 'Escribe el motivo de la corrección');
  if (n.length > MAX_NOTE_LENGTH) throw new LogicError('note_too_long', `El motivo puede tener máximo ${MAX_NOTE_LENGTH} caracteres`);
  return n;
}

function parseInstant(v: unknown, code: string, message: string): string {
  if (typeof v !== 'string' || !v) throw new LogicError(code, message);
  const t = Date.parse(v);
  if (Number.isNaN(t)) throw new LogicError(code, message);
  return new Date(t).toISOString();
}

/**
 * Validates a correction and returns the fields to write. Rules: note
 * required; at least one of clock_in / clock_out changes; clock_out >=
 * clock_in; nothing in the future; the first correction keeps the
 * original_* values for audit.
 */
export function buildCorrection(
  rec: AttendanceLike & { original_clock_in?: string | null; original_clock_out?: string | null },
  input: { clock_in?: unknown; clock_out?: unknown; note?: unknown },
  editorEmail: string,
  nowMs: number
): Record<string, unknown> {
  const note = normalizeNote(input.note);
  const hasIn = input.clock_in !== undefined;
  const hasOut = input.clock_out !== undefined;
  if (!hasIn && !hasOut) throw new LogicError('nothing_to_correct', 'Indica la entrada o la salida que quieres corregir');

  const newIn = hasIn ? parseInstant(input.clock_in, 'invalid_clock_in', 'Entrada inválida') : new Date(Date.parse(rec.clock_in)).toISOString();
  let newOut: string | null = rec.clock_out ? new Date(Date.parse(rec.clock_out)).toISOString() : null;
  if (hasOut) newOut = parseInstant(input.clock_out, 'invalid_clock_out', 'Salida inválida');

  // Small skew allowance so "ahora" typed by a slightly fast client passes.
  const limit = nowMs + 60_000;
  if (Date.parse(newIn) > limit) throw new LogicError('future_date', 'La entrada no puede estar en el futuro');
  if (newOut && Date.parse(newOut) > limit) throw new LogicError('future_date', 'La salida no puede estar en el futuro');
  if (newOut && Date.parse(newOut) < Date.parse(newIn)) {
    throw new LogicError('out_before_in', 'La salida no puede ser antes que la entrada');
  }
  if (newIn === new Date(Date.parse(rec.clock_in)).toISOString() && (newOut ?? null) === (rec.clock_out ? new Date(Date.parse(rec.clock_out)).toISOString() : null)) {
    throw new LogicError('nothing_to_correct', 'No hay cambios que guardar');
  }

  const patch: Record<string, unknown> = {
    clock_in: newIn,
    clock_out: newOut,
    edited_by: editorEmail,
    edit_note: note,
    edited_at: new Date(nowMs).toISOString(),
  };
  if (!rec.edited_at) {
    patch.original_clock_in = rec.clock_in ?? null;
    patch.original_clock_out = rec.clock_out ?? null;
  }
  return patch;
}

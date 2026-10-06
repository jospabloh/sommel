// Pure logic for the `printing` endpoint (entrega-2-contratos.md §5
// "printing"). ZERO imports on purpose, same as the other `_logic.ts` files:
// `deno test` must load it with deno.land/jsr.io blocked.
//
// `LogicError` is local and import-free; handlers re-throw it as HttpError.

export class LogicError extends Error {
  code: string;
  status: number;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** A `reclamado` job older than this returns to the queue (contract §5). */
export const CLAIM_STALE_MS = 2 * 60 * 1000;

/** Last printed jobs returned with `include_done` (contract §5). */
export const DONE_LIMIT = 20;

/** Marker the ticket flow writes on a neutralized twin job. Never retried. */
export const DUPLICATE_MARK = 'duplicado';

export interface JobLike {
  id?: string;
  created_date?: string | null;
  status?: string | null;
  claimed_by?: string | null;
  claimed_at?: string | null;
  error?: string | null;
  attempts?: number | null;
  dedupe_key?: string | null;
  kind?: string | null;
}

function ms(iso: string | null | undefined): number {
  if (!iso) return NaN;
  return new Date(iso).getTime();
}

/**
 * True when a `reclamado` job has been claimed for longer than
 * `CLAIM_STALE_MS`. A claim with a missing or unparseable `claimed_at` is
 * treated as stale: nobody can prove it is still being worked on, and a job
 * stuck forever is worse than one printed twice after a manual confirmation.
 */
export function isClaimStale(job: JobLike, nowMs: number): boolean {
  if (job.status !== 'reclamado') return false;
  const at = ms(job.claimed_at);
  if (!Number.isFinite(at)) return true;
  return nowMs - at > CLAIM_STALE_MS;
}

/** Can `claimNext` take this job? `pendiente`, or `reclamado` and stale. */
export function isClaimable(job: JobLike, nowMs: number): boolean {
  if (job.status === 'pendiente') return true;
  return isClaimStale(job, nowMs);
}

/** Oldest first by `created_date`, id as tiebreak (same rule as pickSurvivor). */
export function compareOldestFirst(a: JobLike, b: JobLike): number {
  const ta = ms(a.created_date);
  const tb = ms(b.created_date);
  const na = Number.isFinite(ta) ? ta : Number.MAX_SAFE_INTEGER;
  const nb = Number.isFinite(tb) ? tb : Number.MAX_SAFE_INTEGER;
  if (na !== nb) return na - nb;
  return String(a.id ?? '').localeCompare(String(b.id ?? ''));
}

/** The next job to claim: the oldest claimable one, or null. */
export function pickNextClaimable<T extends JobLike>(jobs: T[], nowMs: number, kinds: string[] | null = null): T | null {
  const claimable = jobs.filter((j) => isClaimable(j, nowMs) && (kinds === null || kinds.includes(String(j.kind))));
  if (claimable.length === 0) return null;
  return claimable.slice().sort(compareOldestFirst)[0];
}

/**
 * Claim-winner decision, applied to the row RE-READ after the claim write.
 * Two devices can write in the same instant; the last write stands, so the
 * winner is whoever the stored row names.
 */
export function didWinClaim(reread: JobLike | null | undefined, deviceId: string): boolean {
  return !!reread && reread.status === 'reclamado' && reread.claimed_by === deviceId;
}

/** `device_id` must be a short non-empty string. */
export function validateDeviceId(raw: unknown): string {
  const id = typeof raw === 'string' ? raw.trim() : '';
  if (!id) throw new LogicError(400, 'device_required', 'Falta el identificador del dispositivo');
  if (id.length > 80) throw new LogicError(400, 'device_invalid', 'Identificador de dispositivo no válido');
  return id;
}

/** Failure text reported by the station, trimmed and capped. */
export function normalizeError(raw: unknown): string {
  const text = typeof raw === 'string' ? raw.trim() : '';
  return (text || 'Error de impresión').slice(0, 300);
}

export type MarkDecision = 'apply' | 'noop';

/**
 * markPrinted / markFailed: only the device that claimed the job may close
 * it. Repeating the same call from the same device is a no-op (a retried
 * network request must not fail). Anything else is an error.
 */
export function decideMark(job: JobLike, deviceId: string, target: 'impreso' | 'fallido'): MarkDecision {
  if (job.status === target && job.claimed_by === deviceId) return 'noop';
  if (job.status !== 'reclamado') {
    throw new LogicError(409, 'invalid_status', 'Este trabajo ya no está reclamado');
  }
  if (job.claimed_by !== deviceId) {
    throw new LogicError(409, 'claimed_elsewhere', 'Otro dispositivo tiene este trabajo');
  }
  return 'apply';
}

/** retry: only a failed job goes back to the queue; a neutralized twin never does. */
export function assertRetryable(job: JobLike): void {
  if (job.status !== 'fallido') {
    throw new LogicError(409, 'invalid_status', 'Solo se puede reintentar un trabajo fallido');
  }
  if (job.error === DUPLICATE_MARK) {
    throw new LogicError(409, 'duplicate_job', 'Este trabajo era un duplicado y no se imprime');
  }
}

/** reprint: the source must be finished (printed or failed), not in flight. */
export function assertReprintable(job: JobLike): void {
  if (job.status !== 'impreso' && job.status !== 'fallido') {
    throw new LogicError(409, 'invalid_status', 'Solo se puede reimprimir un trabajo ya impreso o fallido');
  }
  if (job.status === 'fallido' && job.error === DUPLICATE_MARK) {
    throw new LogicError(409, 'duplicate_job', 'Este trabajo era un duplicado y no se imprime');
  }
}

/** Next `reprint:<job_id>:<n>` key: one past the highest n already used. */
export function nextReprintKey(jobId: string, existingKeys: Array<string | null | undefined>): string {
  const prefix = `reprint:${jobId}:`;
  let max = 0;
  for (const key of existingKeys) {
    if (typeof key !== 'string' || !key.startsWith(prefix)) continue;
    const n = Number(key.slice(prefix.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `${prefix}${max + 1}`;
}

/** Title for a reprint, shown in the queue. */
export function reprintTitle(title: string | null | undefined, kind: string | null | undefined): string {
  const base = (title || '').trim() || (kind ? `Trabajo ${kind}` : 'Trabajo');
  return base.startsWith('Reimpresión: ') ? base : `Reimpresión: ${base}`;
}

/** Failed jobs worth showing: neutralized duplicates are hidden. */
export function isVisibleFailure(job: JobLike): boolean {
  return job.status === 'fallido' && job.error !== DUPLICATE_MARK;
}

/**
 * Queue order: in-flight and waiting jobs oldest first (the order they will
 * print), then failed ones oldest first.
 */
export function orderQueue<T extends JobLike>(jobs: T[]): T[] {
  const rank = (j: JobLike) => (j.status === 'fallido' ? 1 : 0);
  return jobs.slice().sort((a, b) => rank(a) - rank(b) || compareOldestFirst(a, b));
}

// ---- Printer per job type (2026-10-06) ----
// Each device chooses which kinds it prints (stored in that browser). With two
// printers, the kitchen one takes comandas de cocina and the caja one tickets
// and cortes; before this, any device with auto print took any job.

export const PRINT_KINDS = ['cocina', 'barra', 'cambio', 'ticket', 'corte'] as const;

/** `kinds` from claimNext: missing/null = every kind; otherwise known kinds only, at least one. */
export function validateKinds(raw: unknown): string[] | null {
  if (raw === undefined || raw === null) return null;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > PRINT_KINDS.length) {
    throw new LogicError(400, 'kinds_invalid', 'Elige al menos un tipo de trabajo para este equipo');
  }
  const out = new Set<string>();
  for (const k of raw) {
    if (typeof k !== 'string' || !(PRINT_KINDS as readonly string[]).includes(k)) {
      throw new LogicError(400, 'kinds_invalid', 'Tipo de trabajo no válido');
    }
    out.add(k);
  }
  return [...out];
}

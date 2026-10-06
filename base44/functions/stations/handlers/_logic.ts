// Pure logic for the `stations` (Cocina y barra) endpoint
// (entrega-1-contratos.md §4 "stations"). ZERO imports on purpose — same
// reasoning as scripts/templates/_guard_logic.ts and
// base44/functions/orders/handlers/_logic.ts: this is the part `deno test`
// can load without network access (`deno.land`/`jsr.io` are blocked in the
// sandbox — contract §6). Everything here is a plain function/class over
// plain data.
//
// `LogicError` is a local, import-free error type (not `_guard.ts`'s
// `HttpError`, so this file stays at zero imports). Handlers in this same
// directory catch it and re-throw as `HttpError(400, err.code, err.message)`.

export class LogicError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export type ItemStatus = 'nuevo' | 'enviado' | 'listo' | 'entregado' | 'cancelado';

/**
 * `markReady`: a line already `enviado` is eligible, and one already `listo`
 * is eligible too (that is what makes the action idempotent — calling it
 * again on an already-ready line is not an error). `nuevo` (not sent yet),
 * `entregado` and `cancelado` are not eligible: the handler skips those
 * silently rather than failing the whole batch over one stale/irrelevant id.
 */
export function canMarkReady(status: ItemStatus | string | null | undefined): boolean {
  return status === 'enviado' || status === 'listo';
}

/** True when the line is already in the target state — no re-write needed. */
export function isAlreadyReady(status: ItemStatus | string | null | undefined): boolean {
  return status === 'listo';
}

/** `markDelivered`: `listo` is eligible; `entregado` is idempotent (no-op). */
export function canMarkDelivered(status: ItemStatus | string | null | undefined): boolean {
  return status === 'listo' || status === 'entregado';
}

export function isAlreadyDelivered(status: ItemStatus | string | null | undefined): boolean {
  return status === 'entregado';
}

/** `undoReady`: only a line currently `listo` can be undone back to `enviado`. */
export function canUndoReady(status: ItemStatus | string | null | undefined): boolean {
  return status === 'listo';
}

/** Contract §4 "toque equivocado": undo only within 5 minutes of `ready_at`. */
export const UNDO_WINDOW_MS = 5 * 60 * 1000;

/**
 * `now` is a `Date` (not `Date.now()`) so tests can pass a fixed instant
 * instead of racing the clock. A missing or unparseable `ready_at` is
 * treated as outside the window — no timestamp to undo from.
 */
export function isWithinUndoWindow(
  readyAt: string | null | undefined,
  now: Date
): boolean {
  if (!readyAt) return false;
  const readyTime = Date.parse(readyAt);
  if (Number.isNaN(readyTime)) return false;
  return now.getTime() - readyTime < UNDO_WINDOW_MS;
}

/**
 * `markReady`/`markDelivered` take a batch (`item_ids: string[]`, contract
 * §4). Validated once, up front, before any `loadOwned` — an empty array or
 * a non-string entry is a client bug, not "nothing to do".
 */
export function validateItemIds(itemIds: unknown): string[] {
  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    throw new LogicError('invalid_item_ids', 'Debes indicar al menos un renglón');
  }
  const ids = itemIds.map((id) => (typeof id === 'string' ? id.trim() : ''));
  if (ids.some((id) => !id)) {
    throw new LogicError('invalid_item_ids', 'Id de renglón inválido');
  }
  return ids;
}

/** `undoReady` takes a single `item_id` (contract §4), not a batch. */
export function validateItemId(itemId: unknown): string {
  const id = typeof itemId === 'string' ? itemId.trim() : '';
  if (!id) throw new LogicError('invalid_item_id', 'Id de renglón inválido');
  return id;
}

export type HeatLevel = 'ok' | 'warn' | 'late';

export interface HeatResult {
  ratio: number;
  level: HeatLevel;
}

/**
 * Pure heat-bar formula for the Estaciones screen (contract §5, pantallas 3
 * y 8: "barra de calor (verde→ámbar→rojo contra prep_goal_*_min)").
 *
 * `ratio` = minutes elapsed since `sent_at` / `goalMinutes`. `level` is
 * `'warn'` at >=75% of the goal and `'late'` at >=100% — matching the task's
 * exact thresholds so the Estaciones UI agent's own copy (drawn independent
 * of this file, per the contract's file-ownership split) can be compared
 * against this formula instead of trusting it blind:
 *
 *   ratio = (now - sent_at) in minutes / goalMinutes
 *   level = ratio >= 1    ? 'late'
 *         : ratio >= 0.75 ? 'warn'
 *         :                 'ok'
 *
 * A missing/unparseable `sent_at`, or a non-positive `goalMinutes` (a
 * misconfigured `WineBar.prep_goal_*_min`), returns `{ ratio: 0, level:
 * 'ok' }` rather than throwing or dividing by zero/negative — a heat bar
 * that can't compute a real ratio should read as "just sent", not crash the
 * Estaciones screen or falsely read "late".
 */
export function heatLevel(
  sentAt: string | null | undefined,
  now: Date,
  goalMinutes: number
): HeatResult {
  if (!sentAt || typeof goalMinutes !== 'number' || !Number.isFinite(goalMinutes) || goalMinutes <= 0) {
    return { ratio: 0, level: 'ok' };
  }
  const sentTime = Date.parse(sentAt);
  if (Number.isNaN(sentTime)) return { ratio: 0, level: 'ok' };
  const elapsedMinutes = (now.getTime() - sentTime) / 60000;
  const ratio = elapsedMinutes / goalMinutes;
  let level: HeatLevel = 'ok';
  if (ratio >= 1) level = 'late';
  else if (ratio >= 0.75) level = 'warn';
  return { ratio, level };
}

// ---- Per-station permission (phase 3, 2026-10-06) ----
// `Estaciones:operar` split into one key per station. A line is checked
// against the permission of ITS station, not the screen's: the combined view
// shows both queues, and marking a kitchen line needs Estaciones:cocina.

export const STATION_PERMISSION: Record<string, string> = {
  kitchen: 'Estaciones:cocina',
  bar: 'Estaciones:barra',
};

/** Permission keys needed to act on these lines; `null` = either station key. */
export function permissionsForItems(items: Array<{ station?: string | null }>): { keys: string[]; needsAny: boolean } {
  const keys = new Set<string>();
  let needsAny = false;
  for (const item of items) {
    const key = item?.station ? STATION_PERMISSION[item.station] : undefined;
    if (key) keys.add(key);
    else needsAny = true;
  }
  return { keys: [...keys].sort(), needsAny };
}

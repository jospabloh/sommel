// Pure, import-light helpers for the Estaciones UI (Estacion.jsx + this
// directory). Deliberately self-contained rather than importing from
// `@/components/orders/helpers.js` (owned by the Comandas UI agent, per
// contract §5 file ownership) — two agents building in parallel off the same
// contract shouldn't couple their files to each other's, and `flattenRow`
// here is a one-line normalization, not worth the cross-agent dependency.
//
// `heatLevel` mirrors, on purpose, the EXACT formula documented in
// `base44/functions/stations/handlers/_logic.ts` (contract §5: "barra de
// calor verde→ámbar→rojo contra prep_goal_*_min", warn >= 75%, late >= 100%)
// so this screen's colors agree with the server's own notion of "late" —
// not imported (Deno can't be imported into Vite and vice versa), but kept
// byte-for-byte equivalent in behavior. If the thresholds ever change, both
// copies need the edit.

export const STATION_TITLES = {
  kitchen: 'Cocina',
  bar: 'Barra',
};

export const STATIONS = ['kitchen', 'bar'];

/** The permission each station's buttons need. Mirror of STATION_PERMISSION in
 *  base44/functions/stations/handlers/_logic.ts (station_view_test pins both). */
export const STATION_PERMISSION = {
  kitchen: 'Estaciones:cocina',
  bar: 'Estaciones:barra',
};

/** `/estacion/todo`: kitchen and bar on one screen, for bars where the same
 *  counter prepares both (docs/modo-terminal-diseno.md, "Cocina y barra"). */
export const COMBINED_VIEW = 'todo';

export const VIEW_TITLES = { ...STATION_TITLES, [COMBINED_VIEW]: 'Cocina y barra' };

/** The stations a route param shows, or [] for an unknown one. */
export function stationsForView(view) {
  if (view === COMBINED_VIEW) return [...STATIONS];
  return STATIONS.includes(view) ? [view] : [];
}

/** The combined view's quick filter: 'all' | 'kitchen' | 'bar'. */
export const COMBINED_FILTERS = ['all', ...STATIONS];

export function normalizeCombinedFilter(value) {
  return COMBINED_FILTERS.includes(value) ? value : 'all';
}

/** Keeps a ticket's lines that belong to the chosen filter. */
export function linesForFilter(lines, filter) {
  return filter === 'all' ? lines : lines.filter((l) => l.station === filter);
}

/**
 * Base44 rows come back FLAT from the SDK — `{ id, created_date,
 * updated_date, ...fields }` — from direct entity reads, `subscribe()`
 * events, and `stations`'s own Safe-function responses
 * (markReady/markDelivered/undoReady, which hand back whatever
 * `ctx.svc.entities.OrderItem.update()` returns) alike (confirmed
 * 2026-09-28, see `src/components/orders/helpers.js`'s own comment for the
 * evidence). `flattenRow` is kept only as a defensive no-op/copy for the old
 * nested `{id, data:{...}}` shape, which no real caller here produces.
 */
export function flattenRow(row) {
  if (!row) return null;
  if (row.data && typeof row.data === 'object') {
    return { id: row.id, created_date: row.created_date, updated_date: row.updated_date, ...row.data };
  }
  return row;
}

export function flattenEvent(evt) {
  if (!evt) return null;
  const base = flattenRow(evt.data) || {};
  return { ...base, id: base.id || evt.id };
}

/** Minutes goal for a station, from the WineBar row (contract §2/§5). */
export function goalMinutesFor(station, bar) {
  if (station === 'bar') return typeof bar?.prep_goal_bar_min === 'number' ? bar.prep_goal_bar_min : 8;
  return typeof bar?.prep_goal_kitchen_min === 'number' ? bar.prep_goal_kitchen_min : 15;
}

/**
 * Same formula as the server's `heatLevel` in
 * `base44/functions/stations/handlers/_logic.ts`. `now` is a `Date` so the
 * page's own 30s clock tick (contract §5) drives every bar off one shared
 * instant instead of each row calling `Date.now()` separately.
 */
export function heatLevel(sentAt, now, goalMinutes) {
  if (!sentAt || typeof goalMinutes !== 'number' || !Number.isFinite(goalMinutes) || goalMinutes <= 0) {
    return { ratio: 0, level: 'ok' };
  }
  const sentTime = Date.parse(sentAt);
  if (Number.isNaN(sentTime)) return { ratio: 0, level: 'ok' };
  const elapsedMinutes = (now.getTime() - sentTime) / 60000;
  const ratio = elapsedMinutes / goalMinutes;
  let level = 'ok';
  if (ratio >= 1) level = 'late';
  else if (ratio >= 0.75) level = 'warn';
  return { ratio, level };
}

/** Same 5-minute window as `stations.undoReady` (contract §4). */
export const UNDO_WINDOW_MS = 5 * 60 * 1000;

export function isWithinUndoWindow(readyAt, now) {
  if (!readyAt) return false;
  const readyTime = Date.parse(readyAt);
  if (Number.isNaN(readyTime)) return false;
  return now.getTime() - readyTime < UNDO_WINDOW_MS;
}

/** "12 min" / "1 min" / "menos de 1 min", for entry-time and heat captions. */
export function formatMinutesElapsed(sentAt, now) {
  if (!sentAt) return null;
  const sentTime = Date.parse(sentAt);
  if (Number.isNaN(sentTime)) return null;
  const minutes = Math.floor((now.getTime() - sentTime) / 60000);
  if (minutes <= 0) return 'menos de 1 min';
  return `${minutes} min`;
}

/** Groups this station's OrderItems by their order_id, oldest ticket first. */
export function groupItemsByOrder(items) {
  const map = new Map();
  for (const item of items) {
    if (!item?.order_id) continue;
    const list = map.get(item.order_id) || [];
    list.push(item);
    map.set(item.order_id, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => (a.sent_at || '').localeCompare(b.sent_at || ''));
  }
  return map;
}

/**
 * A ticket's heat when its lines can belong to different stations: each
 * station's lines are measured against THAT station's goal, and the ticket
 * shows the most urgent one. With one station this is exactly
 * `heatLevel(earliestSentAt(lines), now, goalMinutes)`.
 */
export function ticketHeat(lines, now, bar) {
  // Only stations with work still open count; a station whose lines were all
  // cancelled must not heat the ticket. With nothing open, fall back to all.
  const active = lines.filter((l) => l.status === 'enviado' || l.status === 'listo');
  const byStation = new Map();
  for (const line of active.length ? active : lines) {
    const st = STATIONS.includes(line.station) ? line.station : 'kitchen';
    const list = byStation.get(st) || [];
    list.push(line);
    byStation.set(st, list);
  }
  let worst = { ratio: 0, level: 'ok', sentAt: null };
  for (const [st, list] of byStation) {
    const sentAt = earliestSentAt(list);
    const heat = heatLevel(sentAt, now, goalMinutesFor(st, bar));
    if (!worst.sentAt || heat.ratio > worst.ratio) worst = { ...heat, sentAt };
  }
  return worst;
}

/** Earliest `sent_at` among a ticket's still-active (non-cancelled) lines. */
export function earliestSentAt(lines) {
  const active = lines.filter((l) => l.status === 'enviado' || l.status === 'listo');
  const pool = active.length ? active : lines;
  let earliest = null;
  for (const line of pool) {
    if (!line.sent_at) continue;
    if (!earliest || line.sent_at < earliest) earliest = line.sent_at;
  }
  return earliest;
}

/** "Mesa 4" / "Mesa 4 + Mesa 5" / "Para llevar · Ana", for the ticket header. */
export function orderDisplayName(order, tablesById) {
  if (!order) return 'Orden';
  if (order.type === 'llevar') {
    return order.customer_name ? `Para llevar · ${order.customer_name}` : 'Para llevar';
  }
  const names = (order.table_ids || []).map((id) => tablesById.get(id)?.name).filter(Boolean);
  if (names.length === 0) return 'Mesa';
  return names.join(' + ');
}

/** Builds the display line for a chosen variant + modifiers, e.g. "Chico · En leche". */
export function lineSubtitle(item) {
  const parts = [];
  if (item.variant) parts.push(item.variant_label || item.variant);
  const mods = Array.isArray(item.modifiers) ? item.modifiers : [];
  if (mods.length) parts.push(mods.map((m) => m.label || m.key).join(', '));
  return parts.join(' · ');
}

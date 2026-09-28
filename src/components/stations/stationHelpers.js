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

/**
 * Base44 rows come back as `{ id, data: {...}, created_date, updated_date }`
 * from direct entity reads and `subscribe()` events alike; `stations`'s own
 * Safe-function responses (markReady/markDelivered/undoReady) return the raw
 * `OrderItem` row the same nested way (see the handlers — they hand back
 * whatever `ctx.svc.entities.OrderItem.update()` returns, unflattened).
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

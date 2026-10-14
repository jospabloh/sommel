// Merge of one realtime event (`base44.entities.X.subscribe()`) into a list of
// rows. Shared by Mesas, Estacion and Orden; kept import-free so Deno can test
// the odd shapes a socket delivers (base44/tests/realtime_events_test.ts).

/** The event's row, flat, with the id falling back to `evt.id` (a delete carries no payload). */
function eventRow(evt) {
  if (!evt || typeof evt !== 'object') return null;
  const data = evt.data && typeof evt.data === 'object' ? evt.data : null;
  const flat = data && data.data && typeof data.data === 'object'
    ? { id: data.id, created_date: data.created_date, updated_date: data.updated_date, ...data.data }
    : data || {};
  return { ...flat, id: flat.id || evt.id };
}

/** Does a create/update event carry a record we can trust? */
export function hasUsablePayload(evt) {
  return !!evt && !!evt.data && typeof evt.data === 'object' && !evt.data._oversize;
}

/**
 * Applies one realtime event to a list of rows, by id. Pure, so the odd shapes
 * a socket can deliver are covered by tests instead of by hope:
 * - no event, or an event with no id: ignored;
 * - `delete`: removes the row if present (the payload may be empty);
 * - create/update WITHOUT a data payload: ignored. Treating it as "a row with
 *   no fields" would drop an open order (no status) or wipe a line;
 * - an `_oversize` payload (the server slimmed it to fit the socket: long
 *   strings come empty, the record may be a stub) is ignored as well, merging
 *   it would blank real fields;
 * - otherwise the changed fields are merged over the stored row and
 *   `belongs(merged)` decides whether it stays in this list (tenant, status,
 *   station...). Judging the merged row, not the bare event, keeps a partial
 *   payload that lacks e.g. `tenant_id` from evicting a row that still fits;
 * - the same event twice is idempotent.
 *
 * @param {any[]} list
 * @param {any} evt
 * @param {(row: any) => boolean} [belongs]
 * @returns {any[]}
 */
export function applyRealtimeEvent(list, evt, belongs = () => true) {
  const prev = Array.isArray(list) ? list : [];
  if (!evt || typeof evt !== 'object') return prev;
  const row = eventRow(evt);
  if (!row?.id) return prev;
  const idx = prev.findIndex((r) => r?.id === row.id);
  if (evt.type === 'delete') return idx === -1 ? prev : prev.filter((_, i) => i !== idx);
  if (!hasUsablePayload(evt)) return prev;
  const merged = idx === -1 ? row : { ...prev[idx], ...row };
  if (!belongs(merged)) return idx === -1 ? prev : prev.filter((_, i) => i !== idx);
  if (idx === -1) return [...prev, merged];
  const next = prev.slice();
  next[idx] = merged;
  return next;
}

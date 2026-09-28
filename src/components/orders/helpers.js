// Shared, import-light helpers for the Comandas UI (Mesas.jsx, Orden.jsx and
// the components in this directory). Not a Safe-function boundary — this is
// plain client-side display logic, never money math (contract §1/§5: only
// the server computes subtotal/discount/tip/total).

/**
 * Base44 rows returned by direct entity reads (`filter`/`get`/`create`), by
 * every `orders`/`catalog` Safe-function response, and by `catalog`'s own
 * server-side `shapeRow()` are ALL already flat: `{ id, created_date,
 * updated_date, ...fields }` (confirmed 2026-09-28 against the SDK's own
 * `EntityRecord` type and against StockFlow in production, which reads
 * `record.business_id` — never `record.data.business_id` — 400+ times). The
 * `data.` prefix exists only inside RLS rule JSON, never on a row the SDK
 * hands back. `flattenRow` is kept only as a defensive no-op/copy — it
 * tolerates the old nested `{id, data:{...}}` shape if it were ever seen
 * again, but every real caller today already gets a flat row.
 */
export function flattenRow(row) {
  if (!row) return null;
  if (row.data && typeof row.data === 'object') {
    return { id: row.id, created_date: row.created_date, updated_date: row.updated_date, ...row.data };
  }
  return row;
}

/**
 * Normalizes a `RealtimeEvent` from `base44.entities.X.subscribe()` into the
 * same flat `{ id, ...fields }` shape `flattenRow` produces. The SDK passes
 * `{ type, data, id }` where `data` IS already the flat record (e.g.
 * `event.data.status` reads directly) — `flattenRow` is still run over it
 * defensively (see its own comment), and this always falls back to
 * `event.id` when `data` doesn't carry its own id (e.g. a `delete` event).
 */
export function flattenEvent(evt) {
  if (!evt) return null;
  const base = flattenRow(evt.data) || {};
  return { ...base, id: base.id || evt.id };
}

export const STATION_LABELS = {
  kitchen: 'Cocina',
  bar: 'Barra',
  none: 'Sin estación',
};

export const ITEM_STATUS_LABELS = {
  nuevo: 'Sin enviar',
  enviado: 'Enviado',
  listo: 'Listo',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
};

/** Tailwind classes for an OrderItem status badge/border, existing theme tokens only. */
export function itemStatusClasses(status) {
  switch (status) {
    case 'nuevo':
      return 'border-primary/50 bg-primary/10 text-primary';
    case 'enviado':
      return 'border-[hsl(var(--chart-4))]/50 bg-[hsl(var(--chart-4))]/10 text-[hsl(var(--chart-4))]';
    case 'listo':
      return 'border-[hsl(var(--chart-3))]/50 bg-[hsl(var(--chart-3))]/10 text-[hsl(var(--chart-3))]';
    case 'entregado':
      return 'border-border bg-muted/40 text-muted-foreground';
    case 'cancelado':
      return 'border-destructive/50 bg-destructive/10 text-destructive line-through';
    default:
      return 'border-border bg-muted/40 text-muted-foreground';
  }
}

/** A line still editable/removable client-side (contract §4 updateItem/removeItem). */
export function isLineUnsent(status) {
  return status === 'nuevo';
}

/** A line eligible for cancelItem (contract §4: enviado/listo only). */
export function isLineCancellable(status) {
  return status === 'enviado' || status === 'listo';
}

export function tableStatusLabel(status) {
  return status === 'occupied' ? 'Ocupada' : 'Libre';
}

/** Builds the display line for a chosen variant + modifiers, e.g. "Chico · En leche". */
export function lineSubtitle(item) {
  const parts = [];
  if (item.variant) parts.push(item.variant_label || item.variant);
  const mods = Array.isArray(item.modifiers) ? item.modifiers : [];
  if (mods.length) parts.push(mods.map((m) => m.label || m.key).join(', '));
  return parts.join(' · ');
}

// Display helpers for the Inventario UI. Stock math is the server's job
// (stock = sum of movements); this file only formats and parses input.

export const UNITS = [
  { value: 'pieza', label: 'Pieza' },
  { value: 'botella', label: 'Botella' },
  { value: 'g', label: 'Gramos (g)' },
  { value: 'ml', label: 'Mililitros (ml)' },
];

const UNIT_SHORT = { pieza: 'pza', botella: 'bot', g: 'g', ml: 'ml' };

export const MOVEMENT_LABELS = {
  entrada: 'Entrada',
  venta: 'Venta',
  merma: 'Merma',
  conteo: 'Conteo',
  devolucion: 'Devolución',
};

export function unitShort(unit) {
  return UNIT_SHORT[unit] || unit || '';
}

/** 12 -> "12", 0.25 -> "0.25", 1234.5 -> "1,234.5" (max 3 decimals). */
export function formatQty(n) {
  const value = Number(n) || 0;
  return value.toLocaleString('es-MX', { maximumFractionDigits: 3 });
}

/** "+5" / "-2" / "0" for a movement quantity. */
export function formatSignedQty(n) {
  const value = Number(n) || 0;
  return `${value > 0 ? '+' : ''}${formatQty(value)}`;
}

/** Accepts "1,5" or "1.5"; returns a number or NaN. */
export function parseNumber(text) {
  const clean = String(text ?? '').trim().replace(',', '.');
  if (clean === '') return NaN;
  return Number(clean);
}

/** Fresh idempotency key: one per attempt, reused on retries of that attempt. */
export function newKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `k-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Low-stock items first (most depleted ratio first), then by name. */
export function sortItems(items, lowIds) {
  const low = new Set(lowIds);
  return [...items].sort((a, b) => {
    const la = low.has(a.id) ? 0 : 1;
    const lb = low.has(b.id) ? 0 : 1;
    if (la !== lb) return la - lb;
    return String(a.name || '').localeCompare(String(b.name || ''), 'es');
  });
}

export function formatWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

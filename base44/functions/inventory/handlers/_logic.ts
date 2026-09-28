// Pure logic for the `inventory` endpoint (entrega-2-contratos.md §5
// "inventory"). ZERO imports on purpose, same reasoning as the other
// `_logic.ts` files: `deno test` loads it without network access.
// Handlers catch `LogicError` and re-throw it as `HttpError(400, ...)`.

export class LogicError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export const INVENTORY_UNITS = ['pieza', 'botella', 'g', 'ml'] as const;
export const MAX_QTY = 1_000_000;
export const MAX_NAME_LENGTH = 80;
export const MAX_REASON_LENGTH = 200;

/** Stock and quantities are kept to 3 decimals (ml/g arithmetic drifts otherwise). */
export function round3(n: number): number {
  return Math.round((n + Number.EPSILON) * 1000) / 1000;
}

/** Stock = Σ qty of the item's movements (contract §5), rounded to 3 decimals. */
export function computeStock(movements: Array<{ qty?: number | null }>): number {
  let sum = 0;
  for (const m of movements) {
    const q = Number(m?.qty);
    if (Number.isFinite(q)) sum += q;
  }
  return round3(sum);
}

/** `low` = ids whose stock is at or under their alert threshold (contract §5). */
export function lowStockIds(items: Array<{ id: string; stock?: number | null; low_threshold?: number | null }>): string[] {
  return items
    .filter((i) => (Number(i.stock) || 0) <= (Number(i.low_threshold) || 0))
    .map((i) => i.id);
}

/** A positive, finite quantity, rounded to 3 decimals. */
export function validatePositiveQty(qty: unknown): number {
  if (typeof qty !== 'number' || !Number.isFinite(qty) || qty <= 0 || qty > MAX_QTY) {
    throw new LogicError('invalid_qty', 'La cantidad debe ser un número mayor a cero');
  }
  const rounded = round3(qty);
  if (rounded <= 0) throw new LogicError('invalid_qty', 'La cantidad debe ser un número mayor a cero');
  return rounded;
}

/** A physical count: zero is allowed (the shelf is empty), negatives are not. */
export function validateCounted(counted: unknown): number {
  if (typeof counted !== 'number' || !Number.isFinite(counted) || counted < 0 || counted > MAX_QTY) {
    throw new LogicError('invalid_counted', 'Lo contado debe ser un número de cero o más');
  }
  return round3(counted);
}

/** `conteo` movement qty: what the count found minus what the movements say. */
export function countDelta(counted: number, currentStock: number): number {
  return round3(counted - currentStock);
}

export function validateWasteReason(reason: unknown): string {
  const text = typeof reason === 'string' ? reason.trim() : '';
  if (!text) throw new LogicError('reason_required', 'El motivo de la merma es obligatorio');
  if (text.length > MAX_REASON_LENGTH) throw new LogicError('invalid_reason', 'El motivo es demasiado largo');
  return text;
}

/** Optional reason (entries, counts): empty string when absent. */
export function normalizeOptionalReason(reason: unknown): string {
  if (reason === undefined || reason === null) return '';
  if (typeof reason !== 'string') throw new LogicError('invalid_reason', 'El motivo no es válido');
  const text = reason.trim();
  if (text.length > MAX_REASON_LENGTH) throw new LogicError('invalid_reason', 'El motivo es demasiado largo');
  return text;
}

export function validateIdempotencyKey(key: unknown): string {
  const text = typeof key === 'string' ? key.trim() : '';
  if (!text || text.length > 120) {
    throw new LogicError('invalid_idempotency_key', 'Falta la llave de idempotencia');
  }
  return text;
}

/** `unit_cost` is integer centavos, zero or more, or null (not captured). */
export function validateUnitCost(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new LogicError('invalid_cost', 'El costo debe ser un entero en centavos, de cero o más');
  }
  return value;
}

/**
 * Cost write rule (same lesson as StockFlow's `applyCost`): whoever cannot see
 * the cost cannot send it either, so an absent or unauthorized `unit_cost`
 * KEEPS the stored value and never reads as "clear it".
 */
export function applyUnitCost(
  body: { unit_cost?: unknown } | null | undefined,
  canSeeCosts: boolean,
  stored: number | null | undefined,
): number | null {
  const keep = typeof stored === 'number' ? stored : null;
  if (!canSeeCosts) return keep;
  if (!body || body.unit_cost === undefined) return keep;
  return validateUnitCost(body.unit_cost);
}

/** Removes `unit_cost` from a row (D7). */
export function redactUnitCost<T extends Record<string, unknown>>(row: T, canSeeCosts: boolean): T {
  if (canSeeCosts) return row;
  const { unit_cost: _omit, ...rest } = row;
  return rest as T;
}

export interface ItemFields {
  name: string;
  unit: string;
  low_threshold: number;
}

/** Validates the non-cost fields of `upsertItem`; on update, missing fields keep the stored ones. */
export function normalizeItemFields(
  body: { name?: unknown; unit?: unknown; low_threshold?: unknown } | null | undefined,
  existing?: { name?: string; unit?: string; low_threshold?: number | null } | null,
): ItemFields {
  const rawName = body?.name !== undefined ? body.name : existing?.name;
  const name = typeof rawName === 'string' ? rawName.trim() : '';
  if (!name) throw new LogicError('invalid_name', 'El nombre es obligatorio');
  if (name.length > MAX_NAME_LENGTH) throw new LogicError('invalid_name', 'El nombre es demasiado largo');

  const rawUnit = body?.unit !== undefined ? body.unit : existing?.unit;
  if (typeof rawUnit !== 'string' || !(INVENTORY_UNITS as readonly string[]).includes(rawUnit)) {
    throw new LogicError('invalid_unit', 'La unidad debe ser pieza, botella, g o ml');
  }

  let low = 0;
  if (body?.low_threshold !== undefined) {
    const t = body.low_threshold;
    if (typeof t !== 'number' || !Number.isFinite(t) || t < 0 || t > MAX_QTY) {
      throw new LogicError('invalid_threshold', 'El mínimo debe ser un número de cero o más');
    }
    low = round3(t);
  } else if (typeof existing?.low_threshold === 'number') {
    low = existing.low_threshold;
  }
  return { name, unit: rawUnit, low_threshold: low };
}

export interface VariantLike {
  key: string;
  inventory_qty?: number | null;
  [k: string]: unknown;
}

export interface LinkResult {
  inventory_qty?: number;
  variants?: VariantLike[];
}

/**
 * Validates the quantities for `linkProduct`.
 * - Product without variants: `inventory_qty` (body, else stored, else 1) must be > 0.
 * - Product with variants: `variant_qtys` merges over the stored per-variant
 *   values; unknown keys are rejected, 0 means "this variant does not deduct",
 *   and at least one variant must deduct something.
 * Variants keep every other field (price, cost, label) untouched.
 */
export function resolveLinkQuantities(
  product: { inventory_qty?: number | null; variants?: VariantLike[] | null },
  body: { inventory_qty?: unknown; variant_qtys?: unknown } | null | undefined,
): LinkResult {
  const variants = Array.isArray(product.variants) ? product.variants : [];

  if (variants.length === 0) {
    const raw = body?.inventory_qty !== undefined
      ? body.inventory_qty
      : (typeof product.inventory_qty === 'number' && product.inventory_qty > 0 ? product.inventory_qty : 1);
    return { inventory_qty: validatePositiveQty(raw) };
  }

  const given = body?.variant_qtys;
  if (given !== undefined && (given === null || typeof given !== 'object' || Array.isArray(given))) {
    throw new LogicError('invalid_variant_qtys', 'Las cantidades por variante no son válidas');
  }
  const map = (given ?? {}) as Record<string, unknown>;
  const keys = new Set(variants.map((v) => v.key));
  for (const k of Object.keys(map)) {
    if (!keys.has(k)) throw new LogicError('unknown_variant', `La variante "${k}" no existe en el producto`);
  }

  let anyDeducts = false;
  const merged = variants.map((v) => {
    let qty: number | undefined;
    if (Object.prototype.hasOwnProperty.call(map, v.key)) {
      const q = map[v.key];
      if (typeof q !== 'number' || !Number.isFinite(q) || q < 0 || q > MAX_QTY) {
        throw new LogicError('invalid_qty', 'Cada cantidad por variante debe ser un número de cero o más');
      }
      qty = round3(q);
    } else if (typeof v.inventory_qty === 'number') {
      qty = v.inventory_qty;
    }
    if (typeof qty === 'number' && qty > 0) anyDeducts = true;
    return qty === undefined ? { ...v } : { ...v, inventory_qty: qty };
  });
  if (!anyDeducts) {
    throw new LogicError('invalid_qty', 'Al menos una variante debe descontar una cantidad mayor a cero');
  }
  return { variants: merged };
}

/** Removes `cost` and every `variants[].cost` from a product row (D7). */
export function redactProductCosts<T extends { cost?: unknown; variants?: unknown }>(product: T, canSeeCosts: boolean): T {
  if (canSeeCosts) return product;
  const { cost: _cost, ...rest } = product as Record<string, unknown>;
  const variants = Array.isArray(rest.variants)
    ? (rest.variants as Array<Record<string, unknown>>).map((v) => {
        const { cost: _vc, ...vr } = v;
        return vr;
      })
    : rest.variants;
  return { ...rest, variants } as T;
}

/** Newest first, capped: the `movements` action's limit handling. */
export function clampLimit(raw: unknown, fallback = 50, max = 200): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? Math.min(n, max) : fallback;
}

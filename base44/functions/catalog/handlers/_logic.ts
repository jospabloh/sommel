// Pure logic for the `catalog` endpoint (entrega-1-contratos.md §4 "catalog").
//
// ZERO imports on purpose: this is the part `deno test` can load without
// network access (`deno.land`/`jsr.io` are blocked in the sandbox — same
// lesson as StockFlow's `machinery_sales_fields_test.ts`). Everything here is
// a plain function over plain data — no `npm:@base44/sdk`, no `Request`, no
// I/O, no reference to `Ctx`.
//
// `handlers/*.ts` (impure — they call the Base44 client via `Ctx`) import
// this file for every calculation and validation, and never duplicate the
// logic inline. That is what keeps this file the one place a `deno test` run
// actually exercises the rules the contract cares about.

// ---------------------------------------------------------------------------
// Basic coercion helpers
// ---------------------------------------------------------------------------

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

const intOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
};

/**
 * Strict cents parsing for money fields (price/variant price), unlike
 * `intOrNull` above (still used for non-money fields like `sort`, and for
 * `cost`, where `null` legitimately means "aún no capturado"). Fixed
 * 2026-09-28: `intOrNull` silently rounded a fractional/garbage/comma-
 * decimal input ('12,50' -> NaN -> `?? 0`) into a valid price of 0 — a raw
 * `catalog.upsertProduct` call (bypassing the client's own validation) could
 * create or reprice a product to sell for free. This never rounds and never
 * defaults: anything that isn't already a finite non-negative integer comes
 * back `null`, and `validateProduct` below rejects a `null` price outright
 * instead of writing it.
 */
const centsOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return null;
  return n;
};

const STATIONS = new Set(['kitchen', 'bar', 'none']);

/**
 * `station` vacío hereda `Category.station_default` (contract §4). Only a
 * recognized station value overrides the category's default — anything else
 * (missing, empty string, garbage) falls back to it.
 */
export function resolveStation(input: unknown, categoryDefault: unknown): 'kitchen' | 'bar' | 'none' {
  if (typeof input === 'string' && STATIONS.has(input)) return input as 'kitchen' | 'bar' | 'none';
  if (typeof categoryDefault === 'string' && STATIONS.has(categoryDefault)) {
    return categoryDefault as 'kitchen' | 'bar' | 'none';
  }
  return 'none';
}

// ---------------------------------------------------------------------------
// Row shaping — flattens a Base44 row ({ id, data: {...} }) into a plain
// object the API responds with. Pure: takes/returns plain objects only.
// ---------------------------------------------------------------------------

export function shapeRow(row: any): any {
  if (!row) return null;
  const { id, created_date, updated_date, data } = row;
  return { id, created_date, updated_date, ...(data ?? {}) };
}

// ---------------------------------------------------------------------------
// Category
// ---------------------------------------------------------------------------

export interface CategoryFields {
  name: string;
  sort: number;
  station_default: 'kitchen' | 'bar' | 'none';
}

export function normalizeCategoryInput(body: any, existing?: any): CategoryFields {
  const existingData = existing?.data ?? {};
  const name = body?.name !== undefined ? str(body.name) : str(existingData.name);
  const sort = body?.sort !== undefined ? (intOrNull(body.sort) ?? 0) : (existingData.sort ?? 0);
  const stationDefaultInput = body?.station_default !== undefined ? body.station_default : existingData.station_default;
  const station_default = STATIONS.has(stationDefaultInput) ? stationDefaultInput : 'none';
  return { name, sort, station_default };
}

export function validateCategory(fields: CategoryFields): string | null {
  if (!fields.name) return 'El nombre de la categoría es obligatorio';
  return null;
}

// ---------------------------------------------------------------------------
// Product: variants / modifiers
// ---------------------------------------------------------------------------

export interface VariantOut {
  key: string;
  label: string;
  price: number | null;
  cost: number | null;
}

export interface ModifierOut {
  key: string;
  label: string;
}

export function normalizeVariants(input: unknown): VariantOut[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((v: any) => ({
      key: str(v?.key),
      label: str(v?.label),
      // price: null (invalid/missing) is caught by validateProduct, never
      // silently written as 0 (see centsOrNull's comment).
      price: centsOrNull(v?.price),
      cost: intOrNull(v?.cost),
    }))
    .filter((v) => v.key);
}

export function normalizeModifiers(input: unknown): ModifierOut[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((m: any) => ({ key: str(m?.key), label: str(m?.label) }))
    .filter((m) => m.key);
}

// ---------------------------------------------------------------------------
// Product: field normalization + the cost-preservation rule
// ---------------------------------------------------------------------------

export interface ProductFields {
  name: string;
  station: 'kitchen' | 'bar' | 'none';
  price: number | null;
  variants: VariantOut[];
  modifiers: ModifierOut[];
  active: boolean;
  seasonal: boolean;
}

/**
 * Normalizes every product field EXCEPT cost (see `applyCost`/
 * `applyVariantCosts` below, which need the caller's permission — this
 * function doesn't). On update, an omitted field keeps the stored value
 * instead of resetting to a default, so a partial payload (e.g. only
 * `{ id, active: false }` from `toggleProduct`) never wipes the rest.
 */
export function normalizeProductFields(body: any, categoryStationDefault: unknown, existing?: any): ProductFields {
  const existingData = existing?.data ?? {};
  const name = body?.name !== undefined ? str(body.name) : str(existingData.name);
  const stationInput = body?.station !== undefined ? body.station : existingData.station;
  const station = resolveStation(stationInput, categoryStationDefault);
  // Fixed 2026-09-28: an explicitly-sent invalid/garbage/fractional price
  // used to fall back to 0 (a free product) via `intOrNull(...) ?? 0`. Now it
  // stays `null` and `validateProduct` rejects the write outright — the same
  // is true when `price` is simply omitted on a brand-new product (no
  // `existingData` to fall back to).
  const price = body?.price !== undefined ? centsOrNull(body.price) : (existingData.price ?? null);
  const variants = body?.variants !== undefined ? normalizeVariants(body.variants) : normalizeVariants(existingData.variants);
  const modifiers = body?.modifiers !== undefined ? normalizeModifiers(body.modifiers) : normalizeModifiers(existingData.modifiers);
  const active = body?.active !== undefined ? !!body.active : (existing ? existingData.active !== false : true);
  const seasonal = body?.seasonal !== undefined ? !!body.seasonal : !!existingData.seasonal;
  return { name, station, price, variants, modifiers, active, seasonal };
}

/**
 * Decides what `Product.cost` gets written (contract §4: "cost solo con
 * Menú:ver_costos; si no llega se conserva el guardado" — the same lesson
 * StockFlow's `applyCost` fixed for `MachinerySale.cost`).
 *
 * Without `Menú:ver_costos`, whatever the body carries is ignored outright —
 * the stored cost survives untouched, `undefined` included (a brand-new
 * product with no permission to see costs is created with `cost: null`,
 * never a guessed `0`). WITH the permission, an explicit body value (even
 * `null`, meaning "not captured yet") is used; omitting the key entirely
 * keeps the stored value, so editing unrelated fields never blanks the cost.
 */
export function applyCost(body: any, canSeeCosts: boolean, storedCost: number | null): number | null {
  const stored = storedCost ?? null;
  if (!canSeeCosts) return stored;
  if (!Object.prototype.hasOwnProperty.call(body ?? {}, 'cost') || body.cost === undefined) return stored;
  return intOrNull(body.cost);
}

/**
 * Same rule as `applyCost`, per variant, matched by `key` against the
 * STORED variants — never against whatever the (possibly reordered) input
 * array happens to be at that index. A variant key with no stored match
 * (a brand-new variant) gets `cost: null` when the caller lacks the
 * permission, never the value they tried to sneak in.
 */
export function applyVariantCosts(
  inputVariants: VariantOut[],
  canSeeCosts: boolean,
  storedVariants: unknown
): VariantOut[] {
  if (canSeeCosts) return inputVariants;
  const storedByKey = new Map<string, number | null>();
  if (Array.isArray(storedVariants)) {
    for (const v of storedVariants) {
      if (v && typeof v.key === 'string') storedByKey.set(v.key, v.cost ?? null);
    }
  }
  return inputVariants.map((v) => ({
    ...v,
    cost: storedByKey.has(v.key) ? (storedByKey.get(v.key) as number | null) : null,
  }));
}

export function validateProduct(fields: ProductFields, cost: number | null, variants: VariantOut[]): string | null {
  if (!fields.name) return 'El nombre del producto es obligatorio';
  if (variants.length > 0) {
    for (const v of variants) {
      if (!v.label) return 'Cada variante necesita una etiqueta';
      // Fixed 2026-09-28: reject a missing/garbage/fractional price outright
      // instead of the old `< 0` check alone, which let a coerced-to-0 price
      // (see centsOrNull) through as "valid".
      if (v.price === null) return `El precio del tamaño "${v.label}" no es válido`;
      if (v.price <= 0) return `El precio del tamaño "${v.label}" debe ser mayor a cero`;
      if (v.cost !== null && v.cost < 0) return 'El costo de la variante no puede ser negativo';
    }
  } else {
    if (fields.price === null) return 'El precio no es válido';
    if (fields.price <= 0) return 'El precio debe ser mayor a cero';
  }
  if (cost !== null && cost < 0) return 'El costo no puede ser negativo';
  return null;
}

/**
 * Strips `cost` (product-level and per-variant) from an already-shaped
 * product, for a caller without `Menú:ver_costos`. Never substitutes `0` —
 * the key is removed, so the client can't mistake "not authorized to see
 * it" for "captured as zero".
 */
export function stripProductCosts(product: any): any {
  if (!product) return product;
  const { cost: _cost, variants, ...rest } = product;
  return {
    ...rest,
    variants: Array.isArray(variants)
      ? variants.map(({ cost: _vc, ...v }: any) => v)
      : variants,
  };
}

// ---------------------------------------------------------------------------
// importMenu: platform-only, idempotent by (category name, product name)
// ---------------------------------------------------------------------------

export function normalizeCategoryKey(name: unknown): string {
  return str(name).toLowerCase();
}

export function productImportKey(categoryName: unknown, productName: unknown): string {
  return `${normalizeCategoryKey(categoryName)}::${normalizeCategoryKey(productName)}`;
}

export interface SeedCategory {
  name: string;
  sort: number;
  station_default: 'kitchen' | 'bar' | 'none';
}

export function normalizeSeedCategory(raw: any): SeedCategory {
  const stationDefaultInput = raw?.station_default;
  return {
    name: str(raw?.name),
    sort: intOrNull(raw?.sort) ?? 0,
    station_default: STATIONS.has(stationDefaultInput) ? stationDefaultInput : 'none',
  };
}

export interface SeedProduct {
  name: string;
  category: string;
  station: 'kitchen' | 'bar' | 'none';
  price: number;
  cost: number | null;
  variants: VariantOut[];
  modifiers: ModifierOut[];
  active: boolean;
  seasonal: boolean;
}

export function normalizeSeedProduct(raw: any, categoryStationDefault: unknown): SeedProduct {
  return {
    name: str(raw?.name),
    category: str(raw?.category),
    station: resolveStation(raw?.station, categoryStationDefault),
    price: intOrNull(raw?.price) ?? 0,
    cost: intOrNull(raw?.cost),
    variants: normalizeVariants(raw?.variants),
    modifiers: normalizeModifiers(raw?.modifiers),
    active: raw?.active !== false,
    seasonal: !!raw?.seasonal,
  };
}

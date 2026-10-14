// Pure logic for the `orders` (Comandas) endpoint (entrega-1-contratos.md §4
// "orders"). ZERO imports on purpose — same reasoning as
// scripts/templates/_guard_logic.ts: this is the part `deno test` can load
// without network access (`deno.land`/`jsr.io` are blocked in the sandbox).
// Everything here is a plain function/class over plain data.
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

export interface ProductVariant {
  key: string;
  label?: string;
  price: number;
  cost?: number | null;
}

export interface ProductModifier {
  key: string;
  label?: string;
}

export interface ProductLike {
  name: string;
  price?: number | null;
  cost?: number | null;
  station?: string | null;
  variants?: ProductVariant[] | null;
  modifiers?: ProductModifier[] | null;
  active?: boolean;
}

export interface ResolvedModifier {
  key: string;
  label: string;
}

export interface ResolvedItemPricing {
  name: string;
  unit_price: number;
  unit_cost: number | null;
  station: string;
  variant: string | null;
  variant_label: string | null;
  modifiers: ResolvedModifier[];
}

/** Contract §4: "qty positive integer". */
export function validateQty(qty: unknown): number {
  if (typeof qty !== 'number' || !Number.isInteger(qty) || qty <= 0) {
    throw new LogicError('invalid_qty', 'La cantidad debe ser un entero positivo');
  }
  return qty;
}

/** cancelItem/cancelOrder: "motivo obligatorio". */
export function validateReason(reason: unknown): string {
  const trimmed = typeof reason === 'string' ? reason.trim() : '';
  if (!trimmed) throw new LogicError('reason_required', 'El motivo es obligatorio');
  return trimmed;
}

/**
 * Every requested modifier key must exist on the product's own modifier
 * catalog — an unknown key (typo, stale client, or a tampered request) is
 * rejected rather than silently dropped or stored as free text. Duplicate
 * keys collapse to one (Set), since a modifier is either applied or not.
 */
export function resolveModifiers(
  catalogModifiers: ProductModifier[] | null | undefined,
  keys: string[] | null | undefined
): ResolvedModifier[] {
  const catalog = catalogModifiers ?? [];
  const requested = Array.from(new Set((keys ?? []).filter((k) => typeof k === 'string' && k)));
  return requested.map((key) => {
    const found = catalog.find((m) => m.key === key);
    if (!found) {
      throw new LogicError('modifier_not_found', 'Uno de los modificadores elegidos no existe para este producto');
    }
    return { key: found.key, label: found.label ?? found.key };
  });
}

/**
 * D6/contract §4: price and cost come ONLY from the stored Product (or its
 * chosen variant) — this function never accepts a client-sent price. With
 * variants, the product's own price/cost are ignored and a variant key is
 * required; without variants, an extra variant key is rejected rather than
 * silently ignored (it would otherwise suggest the client thinks this
 * product has sizes it doesn't).
 *
 * `unit_cost` stays `null` when the stored cost is null/undefined
 * (Product.cost and variant.cost may be null — "aún no capturado", per
 * Product.jsonc) rather than being coerced to 0 — fixed 2026-09-28: an
 * un-captured cost is a DIFFERENT fact than "this costs nothing", and
 * silently writing 0 would inflate every profit report built on top of
 * OrderItem.unit_cost (exactly the class of bug StockFlow's CLAUDE.md
 * documents repeatedly for a coerced financial field). Not rejecting the
 * sale over it: a bar_admin can always capture the real cost later via
 * `catalog.upsertProduct`, and blocking an order over a missing cost would
 * stop staff from selling at all.
 */
export function resolveItemPricing(
  product: ProductLike,
  opts: { variant?: string | null; modifiers?: string[] | null }
): ResolvedItemPricing {
  if (product.active === false) {
    throw new LogicError('product_inactive', 'Este producto no está activo');
  }

  const variants = product.variants ?? [];
  const requestedVariant = opts.variant ?? null;

  let unit_price: number;
  let unit_cost: number | null;
  let variant: string | null = null;
  let variant_label: string | null = null;

  if (variants.length > 0) {
    if (!requestedVariant) {
      throw new LogicError('variant_required', 'Este producto requiere elegir una variante');
    }
    const match = variants.find((v) => v.key === requestedVariant);
    if (!match) {
      throw new LogicError('variant_not_found', 'La variante elegida no existe para este producto');
    }
    unit_price = match.price;
    unit_cost = match.cost ?? null;
    variant = match.key;
    // Freeze the human label too (not just the key), so cocina/barra never
    // has to display a raw slug like 'chico_2_4_personas' — fixed 2026-09-28.
    variant_label = match.label || match.key;
  } else {
    if (requestedVariant) {
      throw new LogicError('variant_not_found', 'Este producto no tiene variantes');
    }
    unit_price = product.price ?? 0;
    unit_cost = product.cost ?? null;
  }

  if (typeof unit_price !== 'number' || !Number.isFinite(unit_price) || unit_price < 0) {
    throw new LogicError('invalid_price', 'El producto no tiene un precio válido');
  }

  const modifiers = resolveModifiers(product.modifiers, opts.modifiers);
  const station = product.station || 'none';

  return { name: product.name, unit_price, unit_cost, station, variant, variant_label, modifiers };
}

// ---- Extras (priced add-ons, MenuExtra) ----

export interface MenuExtraLike {
  id: string;
  name: string;
  price?: number | null;
  active?: boolean;
  applies_to?: string | null;
  product_ids?: string[] | null;
  tenant_id?: string | null;
}

export interface ResolvedExtra {
  id: string;
  name: string;
  price: number;
}

export interface ResolvedExtras {
  extras: ResolvedExtra[];
  total: number;
}

/** A single line cannot carry an absurd number of extras (a tampered request). */
export const MAX_EXTRAS_PER_LINE = 20;

/**
 * Resolves the extras requested for ONE line against the tenant's stored
 * MenuExtra rows (loaded once per call by the handler, never per line). The
 * client only sends ids: name and price come from the stored row, so a
 * tampered price is impossible, and they are frozen on the OrderItem.
 *
 * Rejected, never silently dropped: a non-array, an unknown id (also another
 * bar's id, same answer so nothing leaks), an inactive extra, one that does
 * not apply to this product, a repeated id. Extras have no cost, so nothing
 * here touches `unit_cost`.
 */
export function resolveExtras(
  catalog: MenuExtraLike[] | null | undefined,
  productId: string,
  requestedIds: unknown,
  tenantId?: string | null
): ResolvedExtras {
  if (requestedIds === undefined || requestedIds === null) return { extras: [], total: 0 };
  if (!Array.isArray(requestedIds)) {
    throw new LogicError('extras_invalid', 'Los extras deben ser una lista');
  }
  if (requestedIds.length > MAX_EXTRAS_PER_LINE) {
    throw new LogicError('extras_invalid', 'Demasiados extras en un solo renglón');
  }
  const rows = catalog ?? [];
  const seen = new Set<string>();
  const extras: ResolvedExtra[] = [];
  let total = 0;
  for (const id of requestedIds) {
    if (typeof id !== 'string' || !id) {
      throw new LogicError('extra_not_found', 'Uno de los extras elegidos no existe');
    }
    if (seen.has(id)) {
      throw new LogicError('extra_duplicate', 'Un extra no se puede agregar dos veces al mismo renglón');
    }
    seen.add(id);
    const found = rows.find((e) => e.id === id && (!tenantId || !e.tenant_id || e.tenant_id === tenantId));
    if (!found) throw new LogicError('extra_not_found', 'Uno de los extras elegidos no existe');
    if (found.active === false) {
      throw new LogicError('extra_inactive', `El extra "${found.name}" ya no está disponible`);
    }
    const applies = found.applies_to === 'products' ? (found.product_ids ?? []).includes(productId) : true;
    if (!applies) {
      throw new LogicError('extra_not_applicable', `El extra "${found.name}" no aplica a este producto`);
    }
    const price = found.price;
    if (typeof price !== 'number' || !Number.isInteger(price) || price < 0) {
      throw new LogicError('invalid_price', `El extra "${found.name}" no tiene un precio válido`);
    }
    extras.push({ id: found.id, name: found.name, price });
    total += price;
  }
  return { extras, total };
}

/**
 * The line's unit_price is base (variant or product) + the sum of its extras,
 * so every existing total, payment, split and report keeps working unchanged.
 * `unit_cost` is NOT touched: extras have no cost.
 */
export function withExtras<T extends { unit_price: number }>(
  pricing: T,
  resolved: ResolvedExtras
): T & { unit_price: number; extras: ResolvedExtra[] } {
  return { ...pricing, unit_price: pricing.unit_price + resolved.total, extras: resolved.extras };
}

// Order totals live in the shared guard logic (`computeOrderTotals` in
// `_guard_logic.ts`), so `orders` and `payments` compute the same numbers.

// ---- State machine ----

export function isOrderOpen(status: string | null | undefined): boolean {
  return status === 'abierta';
}

/** updateItem/removeItem only act on a line still 'nuevo' (not yet sent). */
export function canEditItem(status: string | null | undefined): boolean {
  return status === 'nuevo';
}

/** send: 'nuevo' -> 'enviado'. Only 'nuevo' lines are eligible. */
export function canSendItem(status: string | null | undefined): boolean {
  return status === 'nuevo';
}

/** cancelItem only acts on a line already sent: 'enviado' or 'listo'. */
export function canCancelItem(status: string | null | undefined): boolean {
  return status === 'enviado' || status === 'listo';
}

/** Union of two BarTable id arrays, de-duplicated (mergeOrders). */
export function mergeTableIds(into: string[] | null | undefined, from: string[] | null | undefined): string[] {
  const set = new Set([...(into ?? []), ...(from ?? [])].filter(Boolean));
  return Array.from(set);
}

/**
 * Status a line gets when sent. With the bar's `auto_deliver_no_station` on, a
 * product with no station (water, a closed bottle) is delivered right away:
 * no station shows it, so nobody could ever mark it ready (2026-10-14).
 */
export function sendStatusFor(station: unknown, autoDeliverNoStation: boolean): 'enviado' | 'entregado' {
  const hasStation = station === 'kitchen' || station === 'bar';
  return autoDeliverNoStation && !hasStation ? 'entregado' : 'enviado';
}

/** Default quantity above which a line asks "¿Seguro?" (José, 2026-10-14). */
export const DEFAULT_QTY_CONFIRM = 20;

/** The bar's threshold from Ajustes: 0 means never ask; missing means the default. */
export function qtyConfirmThreshold(bar: { qty_confirm_threshold?: unknown } | null | undefined): number {
  const v = bar?.qty_confirm_threshold;
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : DEFAULT_QTY_CONFIRM;
}

/**
 * Does this quantity need the cashier to confirm it? Only when it goes past
 * the threshold and grows (lowering a big line never asks), and only until the
 * client resends it with `confirm_qty: true`. Guards a typo like 100 for 10,
 * which goes to the bill, the kitchen and the inventory.
 */
export function needsQtyConfirm(qty: unknown, threshold: number, previousQty = 0, confirmed = false): boolean {
  if (confirmed || threshold <= 0) return false;
  return typeof qty === 'number' && qty > threshold && qty > previousQty;
}

/** Rows whose `field` is one of `ids`: re-narrows what an `$in` query returned (same helper as payments/_logic.ts). */
export function narrowByField<T extends Record<string, any>>(rows: T[], field: string, ids: Iterable<string>): T[] {
  const set = new Set(Array.from(ids, String));
  return (rows ?? []).filter((r) => r != null && set.has(String(r[field])));
}

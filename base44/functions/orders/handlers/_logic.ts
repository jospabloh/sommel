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
  unit_cost: number;
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
 * `unit_cost` falls back to 0 when the stored cost is null/undefined
 * (Product.cost and variant.cost may be null — "aún no capturado", per
 * Product.jsonc) rather than rejecting the sale: a bar_admin can always
 * capture the real cost later via `catalog.upsertProduct`, and blocking an
 * order over a missing cost would stop staff from selling at all.
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
  let unit_cost: number;
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
    unit_cost = match.cost ?? 0;
    variant = match.key;
    // Freeze the human label too (not just the key), so cocina/barra never
    // has to display a raw slug like 'chico_2_4_personas' — fixed 2026-09-28.
    variant_label = match.label || match.key;
  } else {
    if (requestedVariant) {
      throw new LogicError('variant_not_found', 'Este producto no tiene variantes');
    }
    unit_price = product.price ?? 0;
    unit_cost = product.cost ?? 0;
  }

  if (typeof unit_price !== 'number' || !Number.isFinite(unit_price) || unit_price < 0) {
    throw new LogicError('invalid_price', 'El producto no tiene un precio válido');
  }

  const modifiers = resolveModifiers(product.modifiers, opts.modifiers);
  const station = product.station || 'none';

  return { name: product.name, unit_price, unit_cost, station, variant, variant_label, modifiers };
}

// ---- Order totals ----

export interface OrderItemLike {
  status: string;
  unit_price: number;
  qty: number;
}

/**
 * Contract §4: "Totales de la orden (subtotal, total) se recalculan en el
 * servidor tras cada cambio de renglones: suma de unit_price*qty de
 * renglones no cancelados." Entrega 1 has no discount/tip yet (payments —
 * D-out-of-scope, plan-tecnico.md §0), so total === subtotal here; those two
 * fields diverge once `payments.applyDiscount`/`setTip` exist in Entrega 2.
 */
export function computeOrderTotals(items: OrderItemLike[]): { subtotal: number; total: number } {
  const subtotal = items.reduce((sum, item) => {
    if (item.status === 'cancelado') return sum;
    const qty = typeof item.qty === 'number' && item.qty > 0 ? item.qty : 0;
    return sum + Math.round(item.unit_price * qty);
  }, 0);
  return { subtotal, total: subtotal };
}

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

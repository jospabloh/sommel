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
/** On unless the bar saved `false` (on by default since 2026-10-15). */
export function autoDeliverNoStationOn(bar: { auto_deliver_no_station?: unknown } | null | undefined): boolean {
  return bar?.auto_deliver_no_station !== false;
}

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

// ---- QA fixes 2026-10-14 ----

/**
 * True when `cancelItem` is a repeat of a request that already wrote (a retry
 * after a 429 that did land): same line, same reason, same person. The
 * handler answers ok instead of 409 `invalid_status`.
 */
export function isRepeatedCancel(
  item: { status?: string | null; cancel_reason?: string | null; cancelled_by?: string | null },
  reason: string,
  email: string | null | undefined
): boolean {
  return item?.status === 'cancelado' && item.cancel_reason === reason && (item.cancelled_by ?? '') === (email ?? '');
}

/** upsertTable fields: seats integer 0..99; zone string; x/y finite numbers. Undefined = not sent. */
export function validateTableFields(body: any): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (body?.seats !== undefined) {
    const s = body.seats;
    if (typeof s !== 'number' || !Number.isInteger(s) || s < 0 || s > 99) {
      throw new LogicError('invalid_seats', 'Los lugares deben ser un número entero de 0 a 99');
    }
    out.seats = s;
  }
  if (body?.zone !== undefined) {
    if (typeof body.zone !== 'string') throw new LogicError('invalid_zone', 'La zona debe ser texto');
    out.zone = body.zone.trim();
  }
  for (const k of ['x', 'y'] as const) {
    if (body?.[k] !== undefined) {
      if (typeof body[k] !== 'number' || !Number.isFinite(body[k])) {
        throw new LogicError('invalid_position', 'La posición de la mesa debe ser un número');
      }
      out[k] = body[k];
    }
  }
  return out;
}

// ---- cancelOrder inventory (mirror of payments' planInventoryMovements) ----
// Kept here because Deno functions cannot import across directories.

export interface CancelInvProduct {
  track_inventory?: boolean | null;
  inventory_item_id?: string | null;
  inventory_qty?: number | null;
  variants?: Array<{ key: string; inventory_qty?: number | null }> | null;
}

export interface CancelInvItem {
  id: string;
  product_id: string;
  variant?: string | null;
  qty?: number | null;
  prepared?: boolean | null;
}

export interface CancelMovement {
  inventory_item_id: string;
  order_item_id: string;
  type: 'merma' | 'devolucion';
  qty: number;
  idempotency_key: string;
  reason: string;
}

function unitQty(product: CancelInvProduct | null | undefined, variant?: string | null): number {
  if (!product || !product.track_inventory || !product.inventory_item_id) return 0;
  let per: number | null | undefined = product.inventory_qty;
  if (variant && Array.isArray(product.variants)) {
    const v = product.variants.find((x) => x.key === variant);
    if (v && typeof v.inventory_qty === 'number') per = v.inventory_qty;
  }
  return typeof per === 'number' && Number.isFinite(per) && per > 0 ? per : 0;
}

/**
 * Inventory effect of cancelling a whole order (every line is cancelled).
 * `ventaByItem` maps order_item_id -> its live 'venta' movement (qty != 0),
 * left by an earlier payment that was later voided.
 * - Line with a live sale: prepared -> the sale already is the waste, nothing;
 *   not prepared -> 'devolucion' that gives the supply back (key reversa:<id>).
 * - Line without a sale: prepared -> 'merma' (key merma:<id>, like cobro);
 *   not prepared -> nothing.
 */
export function planCancelOrderInventory(
  items: CancelInvItem[],
  productsById: Record<string, CancelInvProduct | null | undefined>,
  ventaByItem: Map<string, { qty?: number | null; item_id?: string | null }>
): CancelMovement[] {
  const out: CancelMovement[] = [];
  for (const item of items) {
    const venta = ventaByItem.get(item.id);
    if (venta && (venta.qty ?? 0) !== 0) {
      if (item.prepared || !venta.item_id) continue;
      out.push({
        inventory_item_id: venta.item_id,
        order_item_id: item.id,
        type: 'devolucion',
        qty: Math.abs(venta.qty as number),
        idempotency_key: `reversa:${item.id}`,
        reason: 'Comanda cancelada',
      });
      continue;
    }
    if (!item.prepared) continue;
    const product = productsById[item.product_id];
    const per = unitQty(product, item.variant);
    const qty = typeof item.qty === 'number' && item.qty > 0 ? item.qty : 0;
    if (per <= 0 || qty <= 0) continue;
    out.push({
      inventory_item_id: product!.inventory_item_id as string,
      order_item_id: item.id,
      type: 'merma',
      qty: -Math.round(per * qty * 1000) / 1000,
      idempotency_key: `merma:${item.id}`,
      reason: 'Cancelado ya preparado',
    });
  }
  return out;
}

// ---- addItems idempotency (2026-10-15) ----
// A 429 can arrive AFTER addItems wrote its lines; the retry (automatic or the
// waiter tapping again) used to create them a second time and double the check.
// The client sends one `batch_key` per attempt and every line is stored with
// `idempotency_key = batch_key:index`.

/** A client-made key: 8 to 64 chars of letters, digits, `_` and `-` (a uuid fits). */
export function validateBatchKey(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  if (typeof raw !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(raw)) {
    throw new LogicError('invalid_batch_key', 'La llave de la tanda no es válida');
  }
  return raw;
}

/** One key per line of the batch, in order. */
export function batchLineKeys(batchKey: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${batchKey}:${i}`);
}

export interface IdempotentBatchArgs {
  /** Per-line keys, or null for a client without batch_key (old behavior). */
  keys: string[] | null;
  lines: any[];
  /** Rows of this order whose idempotency_key is in `keys`. */
  find: (keys: string[]) => Promise<any[]>;
  create: (line: any, key: string | null) => Promise<any>;
  /** Cancels a duplicate row (never deletes). */
  neutralize: (row: any) => Promise<void>;
  /** Deterministic survivor of a group (oldest created_date, id tiebreak). */
  pick: (rows: any[]) => any | null;
}

function groupByKey(rows: any[], keys: string[]): Map<string, any[]> {
  const wanted = new Set(keys);
  const out = new Map<string, any[]>();
  for (const r of rows ?? []) {
    const k = r?.idempotency_key;
    if (r == null || typeof k !== 'string' || !wanted.has(k)) continue;
    const list = out.get(k) ?? [];
    list.push(r);
    out.set(k, list);
  }
  return out;
}

/**
 * Creates only the lines of the batch that are not stored yet, then keeps one
 * survivor per key: if two requests ran at once, the losing row is cancelled
 * with reason 'duplicado' (same convention as payments and inventory).
 * `idempotent` is true when every line already existed.
 */
export async function addLinesIdempotent(args: IdempotentBatchArgs): Promise<{ rows: any[]; idempotent: boolean }> {
  const { keys, lines, find, create, neutralize, pick } = args;
  if (!keys) {
    const rows: any[] = [];
    for (const line of lines) rows.push(await create(line, null));
    return { rows, idempotent: false };
  }

  const before = groupByKey(await find(keys), keys);
  const created = new Map<string, any>();
  for (let i = 0; i < lines.length; i++) {
    if (before.has(keys[i])) continue;
    created.set(keys[i], await create(lines[i], keys[i]));
  }
  if (created.size === 0) {
    // A replay. Twins left live by an earlier run whose clean-up failed are
    // neutralised here too, or the order keeps counting them.
    return { rows: await keepOnePerKey(keys, before, created, neutralize, pick), idempotent: true };
  }

  // Concurrent twin requests: re-read and keep one row per key.
  let after: Map<string, any[]>;
  try {
    after = groupByKey(await find(keys), keys);
  } catch {
    return { rows: keys.map((k) => created.get(k) ?? pick(before.get(k) ?? [])).filter(Boolean), idempotent: false };
  }
  return { rows: await keepOnePerKey(keys, after, created, neutralize, pick), idempotent: false };
}

/** One survivor per key (pick's choice); every other live row of that key is
 *  neutralised, best effort: whatever fails is retried by the next replay. */
async function keepOnePerKey(
  keys: string[],
  groups: Map<string, any[]>,
  created: Map<string, any>,
  neutralize: IdempotentBatchArgs['neutralize'],
  pick: IdempotentBatchArgs['pick'],
): Promise<any[]> {
  const rows: any[] = [];
  for (const k of keys) {
    const group = groups.get(k) ?? [];
    const survivor = pick(group) ?? created.get(k) ?? null;
    for (const row of group) {
      if (survivor && row.id !== survivor.id && row.status !== 'cancelado') {
        try { await neutralize(row); } catch { /* best effort: the next replay retries it */ }
      }
    }
    if (survivor) rows.push(survivor);
  }
  return rows;
}

// ---- Negative stock (José, 2026-10-15) ----
// Off by default: a line whose supply does not have enough stock is refused
// when it is added (or its qty goes up), not at cobro. The cobro never blocks:
// what was served was served, so stock can still dip below zero from lines
// that were already open. The admin can allow it in Ajustes → Servicio.

/** True only when the bar saved `allow_negative_stock: true`. */
export function negativeStockAllowed(bar: { allow_negative_stock?: unknown } | null | undefined): boolean {
  return bar?.allow_negative_stock === true;
}

/** Supply needed per inventory item for these lines (qty = how many MORE units). */
export function stockNeeds(
  lines: Array<{ product: CancelInvProduct | null | undefined; variant?: string | null; qty: number }>
): Map<string, number> {
  const out = new Map<string, number>();
  for (const line of lines) {
    const per = unitQty(line.product, line.variant ?? null);
    const qty = typeof line.qty === 'number' && line.qty > 0 ? line.qty : 0;
    if (per <= 0 || qty <= 0) continue;
    const id = line.product!.inventory_item_id as string;
    out.set(id, Math.round(((out.get(id) ?? 0) + per * qty) * 1000) / 1000);
  }
  return out;
}

/**
 * Throws `insufficient_stock` naming the first supply that cannot cover its
 * need. A supply that was not found (or belongs to another bar) is skipped:
 * the cobro skips it too, so it never moves.
 */
export function assertStockCovers(
  needs: Map<string, number>,
  supplies: Map<string, { name?: string | null; unit?: string | null; stock?: number | null }>
): void {
  for (const [id, needed] of needs) {
    const supply = supplies.get(id);
    if (!supply) continue;
    const stock = typeof supply.stock === 'number' && Number.isFinite(supply.stock) ? supply.stock : 0;
    if (needed > stock + 1e-9) {
      const left = Math.max(0, stock);
      const unit = supply.unit ? ` ${supply.unit}` : '';
      throw new LogicError(
        'insufficient_stock',
        `No alcanza el inventario de ${supply.name || 'un insumo'}: quedan ${left}${unit} y se necesitan ${needed}${unit}`
      );
    }
  }
}

// Pure logic for the `payments` (Cobro) endpoint (entrega-2-contratos.md §5
// "payments"). ZERO imports on purpose, same reasoning as
// orders/handlers/_logic.ts: `deno test` loads this without network access.
// The ticket layout lives in `_ticket.ts` (it needs `padLine` from the
// shared guard logic, which is itself import-free).
//
// Money is integer centavos everywhere. `LogicError` is a local error type;
// handlers re-throw it as `HttpError(400, code, message)`.

export class LogicError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export interface MethodDef {
  key: string;
  label: string;
  is_cash: boolean;
  active: boolean;
}

/** The method must exist AND be active in the bar's list (contract: addPayment). */
export function resolveMethod(methods: MethodDef[] | null | undefined, key: unknown): MethodDef {
  const found = (methods ?? []).find((m) => m.key === key);
  if (!found || !found.active) {
    throw new LogicError('invalid_method', 'Esa forma de pago no está disponible');
  }
  return found;
}

/** True when a live (not voided) payment used a cash method. The print station
 *  opens the cash drawer for that ticket; a card-only sale never does. */
export function hasCashPayment(
  payments: Array<{ method?: string | null; voided_at?: string | null }>,
  methods: MethodDef[] | null | undefined,
): boolean {
  const cash = new Set((methods ?? []).filter((m) => m?.is_cash && m.key).map((m) => m.key));
  if (cash.size === 0) cash.add('efectivo');
  return (payments ?? []).some((p) => !p?.voided_at && !!p?.method && cash.has(p.method));
}

/** Σ amount of live (not voided) payments. */
export function paidTotal(payments: Array<{ amount?: number | null; voided_at?: string | null }>): number {
  return (payments ?? []).reduce(
    (sum, p) => (p.voided_at ? sum : sum + (typeof p.amount === 'number' ? p.amount : 0)),
    0
  );
}

// ---- Tip per payment (2026-10-13) ----
// When the bill is split, each payer can leave their own tip. The tip rides
// inside that payment's `amount` and is also stored as `Payment.tip`; the
// order's tip is then the sum of its live payments' tips, so every existing
// total, "falta", corte and report keeps adding up unchanged.

/** Σ tip of payments that are not voided. */
export function paymentTips(payments: Array<{ tip?: number | null; voided_at?: string | null }>): number {
  return (payments ?? []).reduce(
    (sum, p) => (p.voided_at ? sum : sum + (typeof p.tip === 'number' && p.tip > 0 ? p.tip : 0)),
    0
  );
}

/**
 * The tip of ONE payment, over that payment's share of the bill (`portion`).
 * `raw` is `{ pct }` or `{ amount }` (centavos), or missing for no tip.
 */
export function planPaymentTip(raw: unknown, portion: number): number {
  if (raw === undefined || raw === null) return 0;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new LogicError('invalid_tip', 'Propina no válida');
  }
  const r = raw as { pct?: unknown; amount?: unknown };
  return planTip({ pct: r.pct, amount: r.amount, base: portion }).tip;
}

/**
 * Per-payment tips only work while the order's tip IS the sum of its payment
 * tips. An order-wide tip set with setTip (a percentage, or an amount before
 * any payment) is prorated into every share already, so adding more on top
 * would charge it twice.
 */
export function canTipPerPayment(
  order: { tip?: number | null; tip_pct?: number | null },
  payments: Array<{ tip?: number | null; voided_at?: string | null }>
): boolean {
  if (typeof order.tip_pct === 'number') return false;
  return (order.tip ?? 0) === paymentTips(payments);
}

/**
 * The order total WITHOUT the tips already left by earlier payers: splitting
 * by dishes prorates the rest of the bill, and must not hand one payer's tip
 * to the next.
 */
export function billTotalForSplit(order: { total?: number | null }, payments: Array<{ tip?: number | null; voided_at?: string | null }>): number {
  return Math.max(0, (order.total ?? 0) - paymentTips(payments));
}

/** What is still owed. Never negative. */
export function remainingOf(total: number, payments: Array<{ amount?: number | null; voided_at?: string | null }>): number {
  return Math.max(0, (total || 0) - paidTotal(payments));
}

/**
 * amount: integer > 0 and <= remaining. A zero-total order (cortesia) is the
 * one case where amount 0 is accepted: see `canCloseWithoutPayment`.
 */
export function validatePaymentAmount(amount: unknown, remaining: number): number {
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0) {
    throw new LogicError('invalid_amount', 'El monto debe ser un entero mayor a cero');
  }
  if (amount > remaining) {
    throw new LogicError('amount_exceeds_remaining', 'El monto es mayor a lo que falta por cobrar');
  }
  return amount;
}

/**
 * Cash: received >= amount, change = received - amount (server computed).
 * A missing `received` is read as "exact amount". Non-cash: nothing is kept.
 */
export function computeCash(
  method: MethodDef,
  amount: number,
  received: unknown
): { received?: number; change?: number } {
  if (!method.is_cash) return {};
  const got = received === undefined || received === null ? amount : received;
  if (typeof got !== 'number' || !Number.isInteger(got) || got < amount) {
    throw new LogicError('received_too_low', 'El efectivo recibido no alcanza para el monto');
  }
  return { received: got, change: got - amount };
}

/** Contract: order closes when Σ live payments >= total (total must be > 0 here). */
export function shouldClose(total: number, paid: number): boolean {
  return total > 0 && paid >= total;
}

/**
 * A fully discounted order (cortesia, total 0, but real lines) has nothing to
 * collect yet still has to be closed. addPayment accepts amount 0 for it.
 */
export function canCloseWithoutPayment(order: { total?: number | null; subtotal?: number | null }, paid: number): boolean {
  return (order.total ?? 0) === 0 && (order.subtotal ?? 0) > 0 && paid === 0;
}

/**
 * Retry of a void whose payment is ALREADY voided (2026-10-15: a 429 hit
 * between "mark the payment voided" and "update the order", leaving a
 * `cobrada` order that live payments no longer cover). Decides whether the
 * order must go back to `abierta`. Only a human void reopens: payments the
 * system itself voided (`duplicado`, `excede_total`) never do, because a
 * live twin already covers them. Total 0 (cortesia) reopens only when no live
 * payment is left, which is what voiding its $0 marker means.
 */
export function reopenAfterVoid(
  order: { status?: string | null; total?: number | null },
  payment: { voided_by?: string | null },
  payments: Array<{ amount?: number | null; voided_at?: string | null }>
): boolean {
  if (order.status !== 'cobrada') return false;
  if (payment.voided_by === 'sistema') return false;
  const total = order.total ?? 0;
  if (total > 0) return !shouldClose(total, paidTotal(payments));
  return (payments ?? []).every((p) => !!p.voided_at);
}

export function validateReason(reason: unknown): string {
  const trimmed = typeof reason === 'string' ? reason.trim() : '';
  if (!trimmed) throw new LogicError('reason_required', 'El motivo es obligatorio');
  return trimmed;
}

export function validateIdempotencyKey(key: unknown): string {
  const k = typeof key === 'string' ? key.trim() : '';
  if (!k || k.length > 100) {
    throw new LogicError('invalid_idempotency_key', 'Falta la llave de idempotencia');
  }
  return k;
}

export interface DiscountInput {
  kind?: unknown;
  pct?: unknown;
  amount?: unknown;
  reason?: unknown;
  subtotal: number;
}

export interface DiscountPlan {
  discount_kind: 'descuento' | 'cortesia';
  discount_pct: number | null;
  discount: number;
  discount_reason: string;
}

/**
 * Turns an applyDiscount request into the fields to store. 'ninguno' is
 * stored as a 'descuento' of 0 (the Order.discount_kind enum has no empty
 * value, and computeOrderTotals treats it as no discount).
 */
export function planDiscount(input: DiscountInput): DiscountPlan {
  const { kind, pct, amount, subtotal } = input;
  if (kind === 'ninguno') {
    return { discount_kind: 'descuento', discount_pct: null, discount: 0, discount_reason: '' };
  }
  if (kind !== 'descuento' && kind !== 'cortesia') {
    throw new LogicError('invalid_kind', 'Tipo de descuento no válido');
  }
  const reason = validateReason(input.reason);
  if (kind === 'cortesia') {
    return { discount_kind: 'cortesia', discount_pct: null, discount: subtotal, discount_reason: reason };
  }
  const hasPct = pct !== undefined && pct !== null && pct !== '';
  const hasAmount = amount !== undefined && amount !== null && amount !== '';
  if (hasPct === hasAmount) {
    throw new LogicError('invalid_discount', 'Indica un porcentaje o un monto, no ambos');
  }
  if (hasPct) {
    if (typeof pct !== 'number' || !Number.isFinite(pct) || pct <= 0 || pct > 100) {
      throw new LogicError('invalid_pct', 'El porcentaje debe ser mayor a 0 y hasta 100');
    }
    return {
      discount_kind: 'descuento',
      discount_pct: pct,
      discount: Math.min(subtotal, Math.round((subtotal * pct) / 100)),
      discount_reason: reason,
    };
  }
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0) {
    throw new LogicError('invalid_amount', 'El monto debe ser un entero mayor a cero');
  }
  if (amount > subtotal) {
    throw new LogicError('discount_exceeds_subtotal', 'El descuento no puede ser mayor al subtotal');
  }
  return { discount_kind: 'descuento', discount_pct: null, discount: amount, discount_reason: reason };
}

export interface TipPlan {
  tip_pct: number | null;
  tip: number;
}

/** setTip: pct OR amount; neither = remove the tip. */
export function planTip(input: { pct?: unknown; amount?: unknown; base: number }): TipPlan {
  const { pct, amount, base } = input;
  const hasPct = pct !== undefined && pct !== null && pct !== '';
  const hasAmount = amount !== undefined && amount !== null && amount !== '';
  if (!hasPct && !hasAmount) return { tip_pct: null, tip: 0 };
  if (hasPct && hasAmount) throw new LogicError('invalid_tip', 'Indica un porcentaje o un monto, no ambos');
  if (hasPct) {
    if (typeof pct !== 'number' || !Number.isFinite(pct) || pct < 0 || pct > 100) {
      throw new LogicError('invalid_pct', 'El porcentaje debe estar entre 0 y 100');
    }
    return { tip_pct: pct, tip: Math.round((base * pct) / 100) };
  }
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < 0) {
    throw new LogicError('invalid_amount', 'La propina debe ser un entero de cero o más');
  }
  return { tip_pct: null, tip: amount };
}

export interface SplitItem {
  id: string;
  status?: string | null;
  unit_price?: number | null;
  qty?: number | null;
}

function lineAmount(i: SplitItem): number {
  const qty = typeof i.qty === 'number' && i.qty > 0 ? i.qty : 0;
  return Math.round((typeof i.unit_price === 'number' ? i.unit_price : 0) * qty);
}

/**
 * Split by dishes: the chosen lines' share of the order total, so the order's
 * discount and tip are prorated (share = total * chosenSubtotal / subtotal).
 * Capped at what is still owed. Unknown or cancelled ids are rejected.
 */
export function splitByItems(
  items: SplitItem[],
  itemIds: unknown,
  order: { subtotal: number; total: number },
  remaining: number
): number {
  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    throw new LogicError('invalid_items', 'Elige al menos un platillo');
  }
  const unique = Array.from(new Set(itemIds.map(String)));
  let chosen = 0;
  for (const id of unique) {
    const item = items.find((i) => i.id === id);
    if (!item || item.status === 'cancelado') {
      throw new LogicError('invalid_items', 'Uno de los platillos no es válido');
    }
    chosen += lineAmount(item);
  }
  if (order.subtotal <= 0) return 0;
  const share = Math.round((order.total * chosen) / order.subtotal);
  return Math.min(share, remaining);
}

export function validateParts(parts: unknown): number {
  if (typeof parts !== 'number' || !Number.isInteger(parts) || parts < 2 || parts > 20) {
    throw new LogicError('invalid_parts', 'Divide entre 2 y 20 personas');
  }
  return parts;
}

// ---- Inventory planning (contract §5: keys venta:<order_item_id> and
// merma:<order_item_id>) ----

export interface InvProduct {
  track_inventory?: boolean | null;
  inventory_item_id?: string | null;
  inventory_qty?: number | null;
  variants?: Array<{ key: string; inventory_qty?: number | null }> | null;
}

export interface InvOrderItem {
  id: string;
  product_id: string;
  variant?: string | null;
  qty?: number | null;
  status?: string | null;
  prepared?: boolean | null;
}

export interface PlannedMovement {
  inventory_item_id: string;
  order_item_id: string;
  type: 'venta' | 'merma';
  qty: number; // negative: stock goes down
  idempotency_key: string;
  reason: string;
}

/** Units of the supply consumed by ONE sold unit, or 0 when it does not track. */
export function unitInventoryQty(product: InvProduct | null | undefined, variant?: string | null): number {
  if (!product || !product.track_inventory || !product.inventory_item_id) return 0;
  let per: number | null | undefined = product.inventory_qty;
  if (variant && Array.isArray(product.variants)) {
    const v = product.variants.find((x) => x.key === variant);
    if (v && typeof v.inventory_qty === 'number') per = v.inventory_qty;
  }
  return typeof per === 'number' && Number.isFinite(per) && per > 0 ? per : 0;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Sold lines become 'venta'; cancelled lines that were already prepared
 * become 'merma'. Cancelled unprepared lines consume nothing.
 */
export function planInventoryMovements(
  items: InvOrderItem[],
  productsById: Record<string, InvProduct | null | undefined>
): PlannedMovement[] {
  const out: PlannedMovement[] = [];
  for (const item of items) {
    const product = productsById[item.product_id];
    const per = unitInventoryQty(product, item.variant);
    const qty = typeof item.qty === 'number' && item.qty > 0 ? item.qty : 0;
    if (per <= 0 || qty <= 0) continue;
    const amount = round3(per * qty);
    if (item.status === 'cancelado') {
      if (!item.prepared) continue;
      out.push({
        inventory_item_id: product!.inventory_item_id as string,
        order_item_id: item.id,
        type: 'merma',
        qty: -amount,
        idempotency_key: `merma:${item.id}`,
        reason: 'Cancelado ya preparado',
      });
    } else {
      out.push({
        inventory_item_id: product!.inventory_item_id as string,
        order_item_id: item.id,
        type: 'venta',
        qty: -amount,
        idempotency_key: `venta:${item.id}`,
        reason: 'Venta',
      });
    }
  }
  return out;
}

/** stock = Σ qty of the supply's movements (converges even if writes cross). */
export function stockFromMovements(movements: Array<{ qty?: number | null }>): number {
  return round3((movements ?? []).reduce((s, m) => s + (typeof m.qty === 'number' ? m.qty : 0), 0));
}

/**
 * Movements read back for a stock recompute, plus the ones this very call just
 * wrote when the read does not return them yet (2026-10-15: a $0 close left
 * InventoryItem.stock short of the ledger because the recompute read did not
 * see the fresh 'venta' row). The ledger is the truth, so a row we know we
 * created always counts, once.
 */
export function withJustCreated<T extends { idempotency_key?: string | null; item_id?: string | null }>(
  read: T[],
  created: T[]
): T[] {
  const seen = new Set((read ?? []).map((r) => r.idempotency_key));
  return [...(read ?? []), ...created.filter((c) => !seen.has(c.idempotency_key))];
}

// ---- Batched inventory reads (2026-10-14) ----
// Base44's rate limit is app-wide and counts entity operations, so
// deductInventory reads with `$in` instead of one query per row. The helpers
// below are the pure half: chunking, in-memory narrowing (a backend that
// ignores the operator must never widen what we act on), grouping by key and
// duplicate neutralization.

/** Splits a list into chunks of at most `size` (Base44 handles ~100 ids per `$in`). */
export function chunk<T>(list: T[], size = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Rows whose `field` is one of `ids`. Re-narrows what an `$in` query returned. */
export function narrowByField<T extends Record<string, any>>(rows: T[], field: string, ids: Iterable<string>): T[] {
  const set = new Set(Array.from(ids, String));
  return (rows ?? []).filter((r) => r != null && set.has(String(r[field])));
}

/** Groups rows by the value of `field`. */
export function groupByField<T extends Record<string, any>>(rows: T[], field: string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const r of rows ?? []) {
    if (r == null) continue;
    const k = String(r[field]);
    const list = out.get(k);
    if (list) list.push(r);
    else out.set(k, [r]);
  }
  return out;
}

/**
 * Every idempotency key the existence check needs in ONE query: the planned
 * keys plus the `venta:<line>` key of each merma (a line already deducted as
 * a sale must not be deducted again as waste). Deduplicated.
 */
export function collectMovementKeys(planned: Array<{ type: string; order_item_id: string; idempotency_key: string }>): string[] {
  const keys = new Set<string>();
  for (const m of planned) {
    keys.add(m.idempotency_key);
    if (m.type === 'merma') keys.add(`venta:${m.order_item_id}`);
  }
  return Array.from(keys);
}

/** The key that proves a merma was already covered by a sale. */
export function ventaKeyOf(m: { order_item_id: string }): string {
  return `venta:${m.order_item_id}`;
}

/** True when a merma must be skipped: a 'venta' row with qty != 0 exists for its line. */
export function mermaCoveredBySale(
  m: { type: string; order_item_id: string },
  rowsByKey: Map<string, Array<{ qty?: number | null }>>
): boolean {
  if (m.type !== 'merma') return false;
  return (rowsByKey.get(ventaKeyOf(m)) ?? []).some((r) => (r.qty ?? 0) !== 0);
}

/**
 * For rows sharing an idempotency key (concurrent closers can both create
 * it), the ones to zero out: every row except the survivor chosen by `pick`
 * (oldest created_date, id tiebreak) whose qty is not already 0. Works over a
 * mixed batch of keys: each key is judged on its own.
 */
export function duplicatesToNeutralize<T extends { id: string; qty?: number | null; idempotency_key?: string | null }>(
  rows: T[],
  pick: (rows: T[]) => T | null | undefined
): T[] {
  const out: T[] = [];
  for (const group of groupByField(rows, 'idempotency_key').values()) {
    const survivor = pick(group);
    for (const row of group) {
      if (survivor && row.id !== survivor.id && row.qty !== 0) out.push(row);
    }
  }
  return out;
}

/** Every 'YYYY-MM-DD HH:MM' the ticket prints, in the bar's fixed offset. */
export function formatLocalDateTime(iso: string, offsetMin = -360): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const d = new Date(t + offsetMin * 60_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/** Plain money for the ticket: `$1,234.50` (no MXN suffix). */
export function ticketMoney(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(Math.round(cents || 0));
  const pesos = Math.floor(abs / 100);
  const c = String(abs % 100).padStart(2, '0');
  const withCommas = String(pesos).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}$${withCommas}.${c}`;
}

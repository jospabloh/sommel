// Pure aggregation for the `reports` endpoint (entrega-2-contratos.md §5
// "reports"). ZERO imports on purpose, same reasoning as
// scripts/templates/_guard_logic.ts: `deno test` loads this file without
// network access. Everything is a plain function over plain rows, so the
// handler does the reading and this file does every sum.
//
// Money is integer centavos. Time is ISO-8601 UTC; "local" means the bar's
// fixed UTC offset (`offsetMin`, passed in by the handler from
// BAR_UTC_OFFSET_MIN so the constant lives in one place).

export class LogicError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/** Contract §5: a report covers at most 92 local days. */
export const MAX_RANGE_DAYS = 92;
/** Row lists inside the response are capped so a bad month cannot bloat it. */
export const LIST_CAP = 200;
const DAY_MS = 86_400_000;

// ---------------------------------------------------------------- dates ----

function parseDay(dateStr: unknown): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr ?? ''));
  if (!m) throw new LogicError('invalid_date', 'Fecha inválida');
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const ms = Date.UTC(y, mo - 1, d);
  const check = new Date(ms);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) {
    throw new LogicError('invalid_date', 'Fecha inválida');
  }
  return ms;
}

function formatDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export interface ResolvedRange {
  from: string;
  to: string;
  days: number;
  previous_from: string;
  previous_to: string;
}

/**
 * Validates `from`/`to` ('YYYY-MM-DD', inclusive local days) and derives the
 * previous period of the same length, immediately before `from`.
 */
export function resolveRange(from: unknown, to: unknown): ResolvedRange {
  const fromMs = parseDay(from);
  const toMs = parseDay(to);
  if (toMs < fromMs) throw new LogicError('invalid_range', 'La fecha final es anterior a la inicial');
  const days = Math.round((toMs - fromMs) / DAY_MS) + 1;
  if (days > MAX_RANGE_DAYS) {
    throw new LogicError('range_too_large', `El rango máximo es de ${MAX_RANGE_DAYS} días`);
  }
  const previousTo = fromMs - DAY_MS;
  const previousFrom = previousTo - (days - 1) * DAY_MS;
  return {
    from: formatDay(fromMs),
    to: formatDay(toMs),
    days,
    previous_from: formatDay(previousFrom),
    previous_to: formatDay(previousTo),
  };
}

/** `[fromISO, toISO)` membership; `toISO` is exclusive (next local midnight). */
export function inWindow(iso: unknown, fromISO: string, toISO: string): boolean {
  const t = Date.parse(String(iso ?? ''));
  if (Number.isNaN(t)) return false;
  return t >= Date.parse(fromISO) && t < Date.parse(toISO);
}

/** Local hour 0-23 of an instant for a fixed UTC offset in minutes. */
export function hourOf(iso: string, offsetMin: number): number {
  return new Date(Date.parse(iso) + offsetMin * 60_000).getUTCHours();
}

// ---------------------------------------------------------------- rows -----

export interface OrderRow {
  id: string;
  status?: string;
  closed_at?: string;
  opened_by?: string;
  closed_by?: string;
  type?: string;
  customer_name?: string;
  subtotal?: number;
  discount?: number;
  discount_kind?: string | null;
  discount_reason?: string;
  tip?: number;
  total?: number;
}

export interface ItemRow {
  id?: string;
  order_id?: string;
  product_id?: string;
  name?: string;
  variant?: string;
  variant_label?: string;
  qty?: number;
  unit_price?: number;
  unit_cost?: number | null;
  status?: string;
  cancel_reason?: string;
  cancelled_by?: string;
  prepared?: boolean;
  updated_date?: string;
}

export interface PaymentRow {
  order_id?: string;
  method?: string;
  method_label?: string;
  amount?: number;
  voided_at?: string | null;
}

export interface WasteMovementRow {
  item_id?: string;
  qty?: number;
  reason?: string;
  created_by?: string;
  created_date?: string;
  unit_cost?: number | null;
}

export interface ShiftRow {
  id: string;
  closed_at?: string;
  difference?: number | null;
  close_comment?: string;
}

export interface AggregateInput {
  fromISO: string;
  toISO: string;
  previousFromISO: string;
  previousToISO: string;
  offsetMin: number;
  /** Cobrada orders; the function re-filters by window, so a wider read is fine. */
  orders: OrderRow[];
  /** Items of those orders (any status; cancelled ones are skipped for sales). */
  items: ItemRow[];
  payments: PaymentRow[];
  /** Items with status `cancelado`, any order; narrowed by `updated_date`. */
  cancelledItems: ItemRow[];
  products: { id: string; category_id?: string }[];
  categories: { id: string; name?: string }[];
  wasteMovements: WasteMovementRow[];
  inventoryItems: { id: string; name?: string; unit?: string }[];
  shifts: ShiftRow[];
  /** email -> display name. */
  people: Record<string, string>;
  includeCosts: boolean;
  includeCashDifferences: boolean;
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);
const lineName = (i: ItemRow): string => {
  const base = i.name || 'Producto';
  return i.variant_label ? `${base} (${i.variant_label})` : base;
};
const lineSales = (i: ItemRow): number => Math.round(num(i.unit_price) * num(i.qty));

function groupItemsByOrder(items: ItemRow[]): Map<string, ItemRow[]> {
  const map = new Map<string, ItemRow[]>();
  for (const it of items) {
    if (it.status === 'cancelado') continue;
    const key = String(it.order_id ?? '');
    const list = map.get(key);
    if (list) list.push(it);
    else map.set(key, [it]);
  }
  return map;
}

export interface PeriodTotals {
  sales: number;
  sales_net: number;
  orders: number;
  avg_ticket: number;
  tips: number;
  discounts: number;
  discounts_count: number;
  courtesies: number;
  courtesies_count: number;
  items_sold: number;
}

/** Totals of a set of cobrada orders. Sales = Σ order.total (tip included). */
export function computeTotals(orders: OrderRow[], itemsByOrder: Map<string, ItemRow[]>): PeriodTotals {
  let sales = 0;
  let tips = 0;
  let discounts = 0;
  let discountsCount = 0;
  let courtesies = 0;
  let courtesiesCount = 0;
  let itemsSold = 0;
  for (const o of orders) {
    sales += num(o.total);
    tips += num(o.tip);
    const disc = num(o.discount);
    if (o.discount_kind === 'cortesia') {
      courtesies += disc;
      courtesiesCount += 1;
    } else if (disc > 0) {
      discounts += disc;
      discountsCount += 1;
    }
    for (const it of itemsByOrder.get(o.id) ?? []) itemsSold += num(it.qty);
  }
  return {
    sales,
    sales_net: sales - tips,
    orders: orders.length,
    avg_ticket: orders.length > 0 ? Math.round(sales / orders.length) : 0,
    tips,
    discounts,
    discounts_count: discountsCount,
    courtesies,
    courtesies_count: courtesiesCount,
    items_sold: itemsSold,
  };
}

function sortDesc<T>(rows: T[], ...keys: ((r: T) => number)[]): T[] {
  return rows.sort((a, b) => {
    for (const k of keys) {
      const d = k(b) - k(a);
      if (d !== 0) return d;
    }
    return 0;
  });
}

const personName = (people: Record<string, string>, email?: string): string =>
  email ? people[email] || email : '';

/**
 * Builds the whole `reports.summary` payload body (everything except `range`
 * and `previous_range`, which the handler adds). Cost fields exist ONLY when
 * `includeCosts` is true; a line whose `unit_cost` is null/undefined is never
 * counted as cost 0.
 */
export function aggregate(input: AggregateInput) {
  const { offsetMin, includeCosts } = input;
  const closedOrders = input.orders.filter((o) => o.status === undefined || o.status === 'cobrada');
  const current = closedOrders.filter((o) => inWindow(o.closed_at, input.fromISO, input.toISO));
  const previous = closedOrders.filter((o) => inWindow(o.closed_at, input.previousFromISO, input.previousToISO));

  const itemsByOrder = groupItemsByOrder(input.items);
  const totals = computeTotals(current, itemsByOrder);
  const previousTotals = computeTotals(previous, itemsByOrder);
  const currentIds = new Set(current.map((o) => o.id));

  const productCategory = new Map(input.products.map((p) => [p.id, p.category_id]));
  const categoryName = new Map(input.categories.map((c) => [c.id, c.name || 'Sin nombre']));

  // ---- by_product / by_category / costs (lines of current-period orders)
  type ProductRow = {
    product_id: string;
    name: string;
    qty: number;
    sales: number;
    cost?: number;
    profit?: number;
    uncosted?: number;
  };
  const byProduct = new Map<string, ProductRow>();
  const byCategory = new Map<string, { category_id: string | null; name: string; qty: number; sales: number }>();
  let costTotal = 0;
  let costedSales = 0;
  let uncosted = 0;

  for (const o of current) {
    for (const it of itemsByOrder.get(o.id) ?? []) {
      const qty = num(it.qty);
      const sales = lineSales(it);
      const key = `${it.product_id ?? ''}|${it.variant ?? ''}`;
      let row = byProduct.get(key);
      if (!row) {
        row = { product_id: String(it.product_id ?? ''), name: lineName(it), qty: 0, sales: 0 };
        if (includeCosts) {
          row.cost = 0;
          row.profit = 0;
          row.uncosted = 0;
        }
        byProduct.set(key, row);
      }
      row.qty += qty;
      row.sales += sales;

      const catId = productCategory.get(String(it.product_id ?? '')) ?? null;
      const catKey = catId ?? '';
      let cat = byCategory.get(catKey);
      if (!cat) {
        cat = {
          category_id: catId,
          name: catId ? categoryName.get(catId) || 'Sin categoría' : 'Sin categoría',
          qty: 0,
          sales: 0,
        };
        byCategory.set(catKey, cat);
      }
      cat.qty += qty;
      cat.sales += sales;

      if (includeCosts) {
        if (it.unit_cost === null || it.unit_cost === undefined) {
          uncosted += 1;
          row.uncosted = (row.uncosted ?? 0) + 1;
        } else {
          const cost = Math.round(num(it.unit_cost) * qty);
          costTotal += cost;
          costedSales += sales;
          row.cost = (row.cost ?? 0) + cost;
          row.profit = (row.profit ?? 0) + (sales - cost);
        }
      }
    }
  }

  const productRows = sortDesc([...byProduct.values()], (r) => r.sales, (r) => r.qty);
  const topProducts = [...productRows]
    .sort((a, b) => b.qty - a.qty || b.sales - a.sales || a.name.localeCompare(b.name))
    .slice(0, 10)
    .map((r) => ({ product_id: r.product_id, name: r.name, qty: r.qty, sales: r.sales }));

  // ---- by_person (who opened the order)
  const byPersonMap = new Map<string, { email: string; name: string; orders: number; sales: number }>();
  for (const o of current) {
    const email = o.opened_by || '';
    let row = byPersonMap.get(email);
    if (!row) {
      row = { email, name: email ? personName(input.people, email) : 'Sin registro', orders: 0, sales: 0 };
      byPersonMap.set(email, row);
    }
    row.orders += 1;
    row.sales += num(o.total);
  }

  // ---- by_method (active payments of current-period orders)
  const byMethodMap = new Map<string, { method: string; label: string; count: number; amount: number }>();
  for (const p of input.payments) {
    if (p.voided_at) continue;
    if (!currentIds.has(String(p.order_id ?? ''))) continue;
    const key = p.method || '';
    let row = byMethodMap.get(key);
    if (!row) {
      row = { method: key, label: p.method_label || key || 'Sin forma', count: 0, amount: 0 };
      byMethodMap.set(key, row);
    }
    row.count += 1;
    row.amount += num(p.amount);
  }

  // ---- by_hour (always 24 buckets, by local closing hour)
  const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0, sales: 0 }));
  for (const o of current) {
    const h = hourOf(String(o.closed_at), offsetMin);
    byHour[h].orders += 1;
    byHour[h].sales += num(o.total);
  }

  // ---- cancellations (item level, by when the line was cancelled)
  const cancelled = input.cancelledItems
    .filter((i) => i.status === 'cancelado' && inWindow(i.updated_date, input.fromISO, input.toISO))
    .sort((a, b) => Date.parse(String(b.updated_date)) - Date.parse(String(a.updated_date)));
  const cancellations = {
    count: cancelled.length,
    items: cancelled.slice(0, LIST_CAP).map((i) => ({
      name: lineName(i),
      qty: num(i.qty),
      reason: i.cancel_reason || '',
      prepared: !!i.prepared,
      cancelled_by: i.cancelled_by || '',
      cancelled_by_name: personName(input.people, i.cancelled_by),
      at: i.updated_date || '',
    })),
  };

  // ---- courtesies (orders closed as cortesia)
  const courtesyOrders = current
    .filter((o) => o.discount_kind === 'cortesia')
    .sort((a, b) => Date.parse(String(b.closed_at)) - Date.parse(String(a.closed_at)));
  const courtesies = courtesyOrders.slice(0, LIST_CAP).map((o) => ({
    order_id: o.id,
    at: o.closed_at || '',
    amount: num(o.discount),
    reason: o.discount_reason || '',
    customer_name: o.customer_name || '',
    type: o.type || '',
    opened_by_name: personName(input.people, o.opened_by),
    closed_by_name: personName(input.people, o.closed_by),
  }));

  // ---- waste (inventory `merma` movements; neutralized duplicates have qty 0)
  const invItem = new Map(input.inventoryItems.map((i) => [i.id, i]));
  const waste = input.wasteMovements
    .filter((m) => num(m.qty) !== 0 && inWindow(m.created_date, input.fromISO, input.toISO))
    .sort((a, b) => Date.parse(String(b.created_date)) - Date.parse(String(a.created_date)));
  const wasteOut = {
    count: waste.length,
    items: waste.slice(0, LIST_CAP).map((m) => {
      const inv = invItem.get(String(m.item_id ?? ''));
      const qty = Math.abs(num(m.qty));
      const row: Record<string, unknown> = {
        item_id: m.item_id || '',
        name: inv?.name || 'Insumo',
        unit: inv?.unit || '',
        qty,
        reason: m.reason || '',
        created_by_name: personName(input.people, m.created_by),
        at: m.created_date || '',
      };
      if (includeCosts) {
        row.cost = m.unit_cost === null || m.unit_cost === undefined ? null : Math.round(num(m.unit_cost) * qty);
      }
      return row;
    }),
  };

  // ---- cash differences (closed shifts whose count did not match)
  const cashDifferences = input.includeCashDifferences
    ? input.shifts
        .filter((s) => num(s.difference) !== 0 && inWindow(s.closed_at, input.fromISO, input.toISO))
        .sort((a, b) => Date.parse(String(b.closed_at)) - Date.parse(String(a.closed_at)))
        .slice(0, LIST_CAP)
        .map((s) => ({
          shift_id: s.id,
          closed_at: s.closed_at || '',
          difference: num(s.difference),
          comment: s.close_comment || '',
        }))
    : null;

  const result: Record<string, unknown> = {
    totals,
    previous_totals: previousTotals,
    by_product: productRows,
    by_category: sortDesc([...byCategory.values()], (r) => r.sales, (r) => r.qty),
    by_person: sortDesc([...byPersonMap.values()], (r) => r.sales, (r) => r.orders),
    by_method: sortDesc([...byMethodMap.values()], (r) => r.amount, (r) => r.count),
    by_hour: byHour,
    top_products: topProducts,
    cancellations,
    courtesies,
    waste: wasteOut,
    cash_differences: cashDifferences,
  };

  if (includeCosts) {
    const profit = costedSales - costTotal;
    result.costs = {
      cost: costTotal,
      profit,
      margin_pct: costedSales > 0 ? Math.round((profit / costedSales) * 1000) / 10 : null,
      uncosted_items: uncosted,
      costed_sales: costedSales,
    };
  }

  return result;
}

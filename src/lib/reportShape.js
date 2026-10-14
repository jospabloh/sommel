// Defensive shape for `reports.summary`. The report screen reads
// `data.totals.sales`, `data.waste.items.map(...)`, `w.qty.toLocaleString()`
// and so on; a reply from an older or newer deployed function (a missing
// block, a null list, a number sent as text) used to throw while rendering and
// the whole screen showed the error boundary. Everything comes out with the
// same keys and harmless zeros / empty lists. The money itself is never
// computed here (contract §1): numbers are only coerced. No imports: tested in
// Deno (base44/tests/report_shape_test.ts).

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' && typeof v !== 'boolean' ? Number(v) : 0);
const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const arr = (v) => (Array.isArray(v) ? v.filter(isObj) : []);

const TOTAL_KEYS = ['sales', 'sales_net', 'orders', 'avg_ticket', 'tips', 'discounts', 'discounts_count', 'courtesies', 'courtesies_count', 'items_sold'];

function totals(t) {
  const src = isObj(t) ? t : {};
  const out = {};
  for (const k of TOTAL_KEYS) out[k] = num(src[k]);
  return out;
}

function range(r) {
  const src = isObj(r) ? r : {};
  return { ...src, from: str(src.from), to: str(src.to), days: num(src.days) };
}

function rows(list, numeric, text) {
  return arr(list).map((r) => {
    const o = { ...r };
    for (const k of numeric) o[k] = num(r[k]);
    for (const k of text) o[k] = str(r[k]);
    return o;
  });
}

function block(b) {
  const src = isObj(b) ? b : {};
  return { ...src, count: num(src.count), items: arr(src.items) };
}

/** @returns {any} the reply with every block the screen reads present and typed. */
export function cleanReport(res) {
  const r = isObj(res) ? res : {};
  const out = {
    ...r,
    range: range(r.range),
    previous_range: range(r.previous_range),
    totals: totals(r.totals),
    previous_totals: totals(r.previous_totals),
    by_product: rows(r.by_product, ['qty', 'sales', 'cost', 'profit'], ['name']),
    top_products: rows(r.top_products, ['qty', 'sales'], ['name']),
    by_category: rows(r.by_category, ['qty', 'sales'], ['name']),
    by_person: rows(r.by_person, ['orders', 'sales'], ['name']),
    by_method: rows(r.by_method, ['count', 'amount'], ['label']),
    by_hour: rows(r.by_hour, ['hour', 'orders', 'sales'], []),
    courtesies: rows(r.courtesies, ['amount'], []),
  };
  const cancellations = block(r.cancellations);
  cancellations.items = rows(cancellations.items, ['qty'], ['name']);
  out.cancellations = cancellations;
  const waste = block(r.waste);
  waste.items = rows(waste.items, ['qty'], ['name', 'unit']);
  out.waste = waste;
  // Optional blocks stay optional: the screen shows them only when present.
  if (isObj(r.costs)) out.costs = { ...r.costs, cost: num(r.costs.cost), profit: num(r.costs.profit), uncosted_items: num(r.costs.uncosted_items) };
  else delete out.costs;
  if (Array.isArray(r.cash_differences)) out.cash_differences = rows(r.cash_differences, ['difference'], []);
  else delete out.cash_differences;
  return out;
}

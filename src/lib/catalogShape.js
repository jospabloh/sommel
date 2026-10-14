// Defensive shape for `catalog.listProducts`. The screens sort and search by
// `name`, loop `variants`/`modifiers`/`product_ids` and read `id`; a row with
// a null name or a missing list used to throw while rendering (the Menu screen
// showed the error boundary for the whole page). Rows without an id are
// dropped (nothing can key or open them); every other field gets a harmless
// default instead of an exception. No imports: tested in Deno
// (base44/tests/catalog_shape_test.ts).

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const list = (v) => (Array.isArray(v) ? v : []);
const rows = (v) => list(v).filter((r) => isObj(r) && r.id != null && r.id !== '');

export function cleanCategory(c) {
  return { ...c, name: text(c.name), sort: Number.isFinite(Number(c.sort)) ? Number(c.sort) : 0 };
}

export function cleanProduct(p) {
  return {
    ...p,
    name: text(p.name),
    variants: list(p.variants).filter(isObj),
    modifiers: list(p.modifiers).filter(isObj),
  };
}

export function cleanExtra(e) {
  return { ...e, name: text(e.name), product_ids: list(e.product_ids) };
}

/** @returns {{ categories: any[], products: any[], extras: any[] }} */
export function cleanCatalog(res) {
  const r = isObj(res) ? res : {};
  return {
    categories: rows(r.categories).map(cleanCategory),
    products: rows(r.products).map(cleanProduct),
    extras: rows(r.extras).map(cleanExtra),
  };
}

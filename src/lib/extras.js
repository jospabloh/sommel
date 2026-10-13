// Display helpers for priced extras (MenuExtra). No imports: tested in Deno
// (base44/tests/menu_extras_test.ts). The server is the only one that prices a
// line; these only decide what to OFFER and what to PREVIEW.

/**
 * Active extras that apply to a product ('all' or listing its id), in the
 * order the server sent them. `catalog.listProducts` already hides inactive
 * extras from everyone but menu editors, but the order screen filters again so
 * an editor's inactive extras are never offered on a new line.
 */
export function extrasForProduct(extras, productId) {
  if (!Array.isArray(extras)) return [];
  return extras.filter((e) => {
    if (!e || e.active === false) return false;
    if (e.applies_to === 'products') return Array.isArray(e.product_ids) && e.product_ids.includes(productId);
    return true;
  });
}

/** Sum in cents of the chosen extras (preview only; the server recomputes). */
export function extrasTotal(extras, chosenIds) {
  const chosen = new Set(chosenIds ?? []);
  let total = 0;
  for (const e of extras ?? []) if (chosen.has(e.id)) total += Number(e.price) || 0;
  return total;
}

/** "Todos los productos" or "N productos" for the Extras list. */
export function extraScopeLabel(extra) {
  if (extra?.applies_to !== 'products') return 'Todos los productos';
  const n = Array.isArray(extra.product_ids) ? extra.product_ids.length : 0;
  return n === 1 ? '1 producto' : `${n} productos`;
}

/**
 * Pesos typed in the form -> integer cents, or null when it is not a valid
 * amount (empty, negative, more than 2 decimals, not a number). Never rounds
 * silently: "12.505" is rejected instead of becoming 1251 or 1250.
 */
export function pesosInputToCents(text) {
  const raw = String(text ?? '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return null;
  return Math.round(Number(raw) * 100);
}

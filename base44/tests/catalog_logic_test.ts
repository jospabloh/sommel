// Tests for base44/functions/catalog/handlers/_logic.ts.
//
// Zero external imports on purpose: `deno.land`/`jsr.io` are blocked in this
// sandbox (contract §6), so this test runs where it's written instead of
// only getting its first look in CI (the StockFlow `machinery_sales_fields_
// test.ts` lesson).
//
// Run with: $SCRATCH/deno test --allow-env base44/tests/catalog_logic_test.ts

import {
  resolveStation,
  shapeRow,
  normalizeCategoryInput,
  validateCategory,
  normalizeVariants,
  normalizeModifiers,
  normalizeProductFields,
  applyCost,
  applyVariantCosts,
  validateProduct,
  stripProductCosts,
  normalizeCategoryKey,
  productImportKey,
  normalizeSeedCategory,
  normalizeSeedProduct,
} from '../functions/catalog/handlers/_logic.ts';

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(msg || `expected ${e}, got ${a}`);
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

// ---- resolveStation ----

Deno.test('resolveStation: an explicit valid station wins over the category default', () => {
  assertEquals(resolveStation('bar', 'kitchen'), 'bar');
});

Deno.test('resolveStation: empty/missing input inherits the category default', () => {
  assertEquals(resolveStation('', 'kitchen'), 'kitchen');
  assertEquals(resolveStation(undefined, 'bar'), 'bar');
  assertEquals(resolveStation(null, 'bar'), 'bar');
});

Deno.test('resolveStation: "none" is a real explicit value, not treated as empty', () => {
  assertEquals(resolveStation('none', 'kitchen'), 'none');
});

Deno.test('resolveStation: garbage input and garbage category default both fall back to "none"', () => {
  assertEquals(resolveStation('lounge', 'also-garbage'), 'none');
});

// ---- shapeRow ----

Deno.test('shapeRow: copies a flat row as-is (the SDK returns rows flat, not {id, data:{...}})', () => {
  const row = { id: 'abc', created_date: '2026-01-01', updated_date: '2026-01-02', name: 'Tinto', sort: 10 };
  assertEquals(shapeRow(row), { id: 'abc', created_date: '2026-01-01', updated_date: '2026-01-02', name: 'Tinto', sort: 10 });
});

Deno.test('shapeRow: null row stays null', () => {
  assertEquals(shapeRow(null), null);
});

// ---- Category ----

Deno.test('normalizeCategoryInput: fills defaults on create', () => {
  const fields = normalizeCategoryInput({ name: 'Tapas' });
  assertEquals(fields, { name: 'Tapas', sort: 0, station_default: 'none' });
});

Deno.test('normalizeCategoryInput: on update, an omitted field keeps the stored value (flat row)', () => {
  const existing = { id: 'x', name: 'Tapas', sort: 70, station_default: 'kitchen' };
  const fields = normalizeCategoryInput({ id: 'x', sort: 80 }, existing);
  assertEquals(fields, { name: 'Tapas', sort: 80, station_default: 'kitchen' });
});

Deno.test('normalizeCategoryInput: a flat row is read directly, NOT via existing.data (would silently lose the stored name/station_default)', () => {
  const existing = { id: 'x', name: 'Tapas', sort: 70, station_default: 'kitchen' };
  // Same fixture read the old (wrong) way would see undefined for name/station_default.
  const wrongWay = (existing as any).data ?? {};
  assert(wrongWay.name === undefined, 'sanity check: the old .data read finds nothing on a flat row');
  const fields = normalizeCategoryInput({ id: 'x' }, existing);
  assertEquals(fields, { name: 'Tapas', sort: 70, station_default: 'kitchen' });
});

Deno.test('validateCategory: empty name is rejected', () => {
  assert(typeof validateCategory({ name: '', sort: 0, station_default: 'none' }) === 'string', 'expected an error message');
  assertEquals(validateCategory({ name: 'Postres', sort: 0, station_default: 'none' }), null);
});

// ---- variants / modifiers normalization ----

Deno.test('normalizeVariants: drops entries with no key, coerces price/cost', () => {
  const out = normalizeVariants([
    { key: 'chico', label: 'Chico', price: '650', cost: '200' },
    { key: '', label: 'sin key' },
  ]);
  assertEquals(out, [{ key: 'chico', label: 'Chico', price: 650, cost: 200 }]);
});

Deno.test('normalizeVariants: non-array input yields empty array', () => {
  assertEquals(normalizeVariants(undefined), []);
  assertEquals(normalizeVariants('nope'), []);
});

Deno.test('normalizeModifiers: drops entries with no key, never carries a price', () => {
  const out = normalizeModifiers([{ key: 'leche', label: 'En leche', price: 999 }, { label: 'sin key' }]);
  assertEquals(out, [{ key: 'leche', label: 'En leche' }]);
});

// ---- normalizeProductFields ----

Deno.test('normalizeProductFields: create fills sensible defaults, inherits station', () => {
  const fields = normalizeProductFields({ name: 'Terracota', price: 9000 }, 'bar');
  assertEquals(fields, { name: 'Terracota', station: 'bar', price: 9000, variants: [], modifiers: [], active: true, seasonal: false });
});

Deno.test('normalizeProductFields: update with a partial body keeps everything else stored (flat row)', () => {
  const existing = {
    id: 'p1',
    name: '4 Estaciones',
    station: 'kitchen',
    price: 0,
    variants: [{ key: 'chico', label: 'Chico', price: 65000, cost: null }],
    modifiers: [],
    active: true,
    seasonal: false,
  };
  const fields = normalizeProductFields({ id: 'p1', active: false }, 'kitchen', existing);
  assertEquals(fields, {
    name: '4 Estaciones',
    station: 'kitchen',
    price: 0,
    variants: [{ key: 'chico', label: 'Chico', price: 65000, cost: null }],
    modifiers: [],
    active: false,
    seasonal: false,
  });
});

// ---- applyCost: the load-bearing rule (contract §4 + StockFlow lesson) ----

Deno.test('applyCost: without ver_costos, an explicit body cost is ignored — stored value survives', () => {
  assertEquals(applyCost({ cost: 999999 }, false, 5000), 5000);
});

Deno.test('applyCost: without ver_costos on a brand-new product, cost stays null (never guessed as 0)', () => {
  assertEquals(applyCost({ cost: 999999 }, false, null), null);
});

Deno.test('applyCost: with ver_costos, omitting the key keeps the stored value (editing unrelated fields never blanks cost)', () => {
  assertEquals(applyCost({ name: 'nuevo nombre' }, true, 5000), 5000);
});

Deno.test('applyCost: with ver_costos, an explicit value is written, including explicit null', () => {
  assertEquals(applyCost({ cost: 6000 }, true, 5000), 6000);
  assertEquals(applyCost({ cost: null }, true, 5000), null);
});

// ---- applyVariantCosts ----

Deno.test('applyVariantCosts: without ver_costos, every variant cost is replaced by its stored match (by key)', () => {
  const input = [
    { key: 'chico', label: 'Chico', price: 65000, cost: 999999 },
    { key: 'grande', label: 'Grande', price: 199000, cost: 500000 },
  ];
  const stored = [{ key: 'chico', label: 'Chico', price: 65000, cost: 20000 }];
  const out = applyVariantCosts(input, false, stored);
  assertEquals(out, [
    { key: 'chico', label: 'Chico', price: 65000, cost: 20000 },
    { key: 'grande', label: 'Grande', price: 199000, cost: null },
  ]);
});

Deno.test('applyVariantCosts: with ver_costos, the input is passed through untouched', () => {
  const input = [{ key: 'chico', label: 'Chico', price: 65000, cost: 20000 }];
  assertEquals(applyVariantCosts(input, true, []), input);
});

// ---- validateProduct ----

Deno.test('validateProduct: rejects missing name, negative price, negative cost', () => {
  const base = { name: '', station: 'none' as const, price: 0, variants: [], modifiers: [], active: true, seasonal: false };
  assert(typeof validateProduct(base, null, []) === 'string', 'expected error for missing name');
  assert(typeof validateProduct({ ...base, name: 'Vino', price: -1 }, null, []) === 'string', 'expected error for negative price');
  assert(typeof validateProduct({ ...base, name: 'Vino' }, -1, []) === 'string', 'expected error for negative cost');
  assertEquals(validateProduct({ ...base, name: 'Vino', price: 1000 }, 500, []), null);
});

// ---- Fixed 2026-09-28: an invalid/garbage/missing price must never be
// silently coerced to 0 (a free product/variant), on the server, regardless
// of whether the client happened to validate it. ----

Deno.test('normalizeVariants: a comma-decimal or garbage price becomes null, NOT 0', () => {
  const out = normalizeVariants([{ key: 'chico', label: 'Chico', price: '12,50', cost: 100 }]);
  assertEquals(out, [{ key: 'chico', label: 'Chico', price: null, cost: 100 }]);
});

Deno.test('normalizeVariants: a fractional cents price becomes null, NOT rounded', () => {
  const out = normalizeVariants([{ key: 'chico', label: 'Chico', price: 12.6, cost: 100 }]);
  assertEquals(out, [{ key: 'chico', label: 'Chico', price: null, cost: 100 }]);
});

Deno.test('normalizeProductFields: an explicitly-sent invalid price becomes null, not 0', () => {
  const fields = normalizeProductFields({ name: 'Terracota', price: 'garbage' }, 'bar');
  assertEquals(fields.price, null);
});

Deno.test('normalizeProductFields: a brand-new product with NO price at all gets null, not 0', () => {
  const fields = normalizeProductFields({ name: 'Terracota' }, 'bar');
  assertEquals(fields.price, null);
});

Deno.test('validateProduct: a null price (garbage/missing input) is rejected, not treated as 0', () => {
  const base = { name: 'Vino', station: 'none' as const, price: null, variants: [], modifiers: [], active: true, seasonal: false };
  assert(typeof validateProduct(base, null, []) === 'string', 'expected error for null price');
});

Deno.test('validateProduct: price exactly 0 is rejected (never a silently-free product)', () => {
  const base = { name: 'Vino', station: 'none' as const, price: 0, variants: [], modifiers: [], active: true, seasonal: false };
  assert(typeof validateProduct(base, null, []) === 'string', 'expected error for price 0');
});

Deno.test('validateProduct: a variant with a null (invalid) price is rejected', () => {
  const base = { name: 'Tabla', station: 'kitchen' as const, price: null, variants: [], modifiers: [], active: true, seasonal: false };
  const badVariant = [{ key: 'chico', label: 'Chico', price: null, cost: null }];
  assert(typeof validateProduct(base, null, badVariant) === 'string', 'expected error for a variant with a null price');
});

Deno.test('validateProduct: with variants, the product-level price is not checked, but each variant is', () => {
  const base = { name: 'Tabla', station: 'kitchen' as const, price: 0, variants: [], modifiers: [], active: true, seasonal: false };
  const badVariant = [{ key: 'chico', label: '', price: 100, cost: null }];
  assert(typeof validateProduct(base, null, badVariant) === 'string', 'expected error for a variant with no label');
  const okVariant = [{ key: 'chico', label: 'Chico', price: 100, cost: null }];
  assertEquals(validateProduct(base, null, okVariant), null);
});

// ---- stripProductCosts: the other half of the "cost never reaches the
// browser" rule (contract §4/D7) — this is what listProducts calls. ----

Deno.test('stripProductCosts: removes cost at the product level and from every variant, no key left as 0', () => {
  const product = {
    id: 'p1',
    name: '4 Estaciones',
    cost: 30000,
    variants: [
      { key: 'chico', label: 'Chico', price: 65000, cost: 20000 },
      { key: 'grande', label: 'Grande', price: 199000, cost: null },
    ],
  };
  const stripped = stripProductCosts(product);
  assertEquals(stripped, {
    id: 'p1',
    name: '4 Estaciones',
    variants: [
      { key: 'chico', label: 'Chico', price: 65000 },
      { key: 'grande', label: 'Grande', price: 199000 },
    ],
  });
  assert(!Object.prototype.hasOwnProperty.call(stripped, 'cost'), 'cost key must be absent, not 0/null');
  assert(!Object.prototype.hasOwnProperty.call(stripped.variants[0], 'cost'), 'variant cost key must be absent');
});

Deno.test('stripProductCosts: a product with no variants array passes through unchanged besides cost', () => {
  const stripped = stripProductCosts({ id: 'p2', name: 'Café', cost: 1000 });
  assertEquals(stripped, { id: 'p2', name: 'Café' });
});

// ---- End-to-end: a caller without ver_costos never receives cost, and
// cannot overwrite it either (the exact scenario the contract calls out). ----

Deno.test('end-to-end: staff without ver_costos edits a product — cost is preserved server-side AND never returned (flat row)', () => {
  const existing = { id: 'prod1', name: 'Malbec', category_id: 'cat1', station: 'bar', price: 50000, cost: 25000, variants: [], modifiers: [], active: true, seasonal: false };
  const body = { id: 'prod1', price: 55000, cost: 1 }; // staff tries to smuggle cost: 1
  const canSeeCosts = false;

  const fields = normalizeProductFields(body, 'bar', existing);
  const cost = applyCost(body, canSeeCosts, existing.cost);
  const variants = applyVariantCosts(fields.variants, canSeeCosts, existing.variants);
  const error = validateProduct(fields, cost, variants);
  assertEquals(error, null);
  assertEquals(cost, 25000, 'the smuggled cost:1 must never be written');

  const writtenRow = { ...existing, ...fields, cost, id: 'prod1' };
  const responseShape = stripProductCosts(shapeRow(writtenRow));
  assert(!Object.prototype.hasOwnProperty.call(responseShape, 'cost'), 'response must never carry cost for this caller');
  assertEquals(responseShape.price, 55000, 'the legitimate price edit still goes through');
});

// ---- importMenu helpers: idempotency keys ----

Deno.test('normalizeCategoryKey / productImportKey: case-insensitive matching', () => {
  assertEquals(normalizeCategoryKey('  Tapas '), 'tapas');
  assertEquals(productImportKey('Tapas', 'Hummus'), 'tapas::hummus');
  assertEquals(productImportKey(' tapas', 'HUMMUS '), 'tapas::hummus');
});

Deno.test('normalizeSeedCategory: defaults an unrecognized station_default to none', () => {
  assertEquals(normalizeSeedCategory({ name: 'Vinos', sort: 10, station_default: 'garbage' }), {
    name: 'Vinos',
    sort: 10,
    station_default: 'none',
  });
});

Deno.test('normalizeSeedProduct: inherits category station, defaults cost to null, active defaults true', () => {
  const out = normalizeSeedProduct({ name: 'Malbec', category: 'Vino por botella', price: 50000, cost: null }, 'bar');
  assertEquals(out, {
    name: 'Malbec',
    category: 'Vino por botella',
    station: 'bar',
    price: 50000,
    cost: null,
    variants: [],
    modifiers: [],
    active: true,
    seasonal: false,
  });
});

Deno.test('normalizeSeedProduct: an explicit false wins over the default-active rule', () => {
  const out = normalizeSeedProduct({ name: 'Fuera de temporada', category: 'X', price: 100, active: false }, 'none');
  assertEquals(out.active, false);
});

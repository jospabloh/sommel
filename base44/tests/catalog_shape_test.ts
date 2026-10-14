// Deno tests for cleanCatalog (src/lib/catalogShape.js): odd listProducts
// replies (null names, missing lists, rows with no id, a non-object body) must
// come out in a shape the Menu / picker can sort and loop without throwing.
// Zero external imports.
//   deno test --allow-env base44/tests/catalog_shape_test.ts
// @ts-ignore: plain JS module, the same file the client imports.
import { cleanCatalog } from '../../src/lib/catalogShape.js';

function assertEquals(a: unknown, b: unknown, msg?: string) {
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  if (sa !== sb) throw new Error(`${msg ?? 'not equal'}: ${sa} !== ${sb}`);
}

Deno.test('a body that is not an object gives three empty lists', () => {
  for (const bad of [null, undefined, 'x', 5, []]) {
    assertEquals(cleanCatalog(bad), { categories: [], products: [], extras: [] });
  }
});

Deno.test('missing or non-array lists become empty lists', () => {
  assertEquals(cleanCatalog({ categories: null, products: 'x', extras: {} }), { categories: [], products: [], extras: [] });
});

Deno.test('rows that are not objects or have no id are dropped', () => {
  const out = cleanCatalog({ products: [null, 3, { name: 'sin id' }, { id: '', name: 'vacio' }, { id: 'p1', name: 'Vino' }] });
  assertEquals(out.products.map((p: { id: string }) => p.id), ['p1']);
});

Deno.test('a null name is an empty string, so sorting by name cannot throw', () => {
  const out = cleanCatalog({
    categories: [{ id: 'c1', name: null, sort: '2' }, { id: 'c2', name: 7 }],
    products: [{ id: 'p1', name: null }, { id: 'p2', name: 'Tapa' }],
    extras: [{ id: 'e1', name: undefined, price: 100 }],
  });
  const names = [...out.products].sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'es')).map((p: { name: string }) => p.name);
  assertEquals(names, ['', 'Tapa']);
  assertEquals(out.categories.map((c: { name: string; sort: number }) => [c.name, c.sort]), [['', 2], ['7', 0]]);
  assertEquals(out.extras[0].name, '');
});

Deno.test('variants, modifiers and product_ids default to lists', () => {
  const out = cleanCatalog({
    products: [{ id: 'p1', variants: null, modifiers: 'x' }, { id: 'p2', variants: [null, { key: 'a' }], modifiers: [{ key: 'm' }] }],
    extras: [{ id: 'e1', product_ids: null }],
  });
  assertEquals(out.products[0].variants, []);
  assertEquals(out.products[0].modifiers, []);
  assertEquals(out.products[1].variants, [{ key: 'a' }]);
  assertEquals(out.extras[0].product_ids, []);
});

Deno.test('good rows keep every field they had', () => {
  const p = { id: 'p1', name: 'Vino', price: 9500, station: 'bar', variants: [], modifiers: [], active: true };
  assertEquals(cleanCatalog({ products: [p] }).products[0], p);
});

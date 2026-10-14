// Deno tests for dropNullItems (src/lib/apiShape.js): holes in the lists a
// function returns must not reach the screens. Zero external imports.
//   deno test --allow-env base44/tests/api_shape_test.ts
// @ts-ignore: plain JS module, the same file the client imports.
import { dropNullItems } from '../../src/lib/apiShape.js';

function assertEquals(a: unknown, b: unknown, msg?: string) {
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  if (sa !== sb) throw new Error(`${msg ?? 'not equal'}: ${sa} !== ${sb}`);
}

Deno.test('holes in a list of records are removed, at any depth', () => {
  assertEquals(dropNullItems({ ok: true, people: [null, { id: 'a', kinds: ['x'] }, undefined] }), { ok: true, people: [{ id: 'a', kinds: ['x'] }] });
  assertEquals(dropNullItems({ a: { b: [null, { id: 1 }] } }), { a: { b: [{ id: 1 }] } });
});

Deno.test('a list of numbers keeps its nulls, so positions do not shift', () => {
  // An hour with no sales is a null at its position; dropping it would move
  // every later hour one slot earlier.
  assertEquals(dropNullItems({ by_hour: [null, 1200, null, 300] }), { by_hour: [null, 1200, null, 300] });
  assertEquals(dropNullItems({ kinds: ['x', null] }), { kinds: ['x', null] });
});

Deno.test('values that are not holes pass through untouched', () => {
  const body = { ok: true, amounts: [10000, 0, 5000], names: ['a', ''], flags: [false, true], shift: null, order: { id: 'o', notes: null }, n: 0, s: '' };
  assertEquals(dropNullItems(body), body);
});

Deno.test('non-object bodies come back as they were', () => {
  assertEquals(dropNullItems(null), null);
  assertEquals(dropNullItems(undefined), undefined);
  assertEquals(dropNullItems('x'), 'x');
  assertEquals(dropNullItems(5), 5);
  assertEquals(dropNullItems([]), []);
});

Deno.test('an object field set to null stays null (only list holes go)', () => {
  assertEquals(dropNullItems({ shift: null, items: [null] }), { shift: null, items: [] });
});

// Deno tests for dropNullItems (src/lib/apiShape.js): holes in the lists a
// function returns must not reach the screens. Zero external imports.
//   deno test --allow-env base44/tests/api_shape_test.ts
// @ts-ignore: plain JS module, the same file the client imports.
import { dropNullItems } from '../../src/lib/apiShape.js';

function assertEquals(a: unknown, b: unknown, msg?: string) {
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  if (sa !== sb) throw new Error(`${msg ?? 'not equal'}: ${sa} !== ${sb}`);
}

Deno.test('null and undefined elements are removed, at any depth', () => {
  assertEquals(dropNullItems({ ok: true, people: [null, { id: 'a', kinds: ['x', null] }, undefined] }), { ok: true, people: [{ id: 'a', kinds: ['x'] }] });
  assertEquals(dropNullItems({ a: { b: [[null, 1], null] } }), { a: { b: [[1]] } });
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

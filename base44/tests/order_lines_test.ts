// Deno tests for upsertById (src/components/orders/helpers.js), which keeps a
// freshly added order line from showing twice. Zero external imports.
//   deno test --allow-env base44/tests/order_lines_test.ts
// @ts-ignore: plain JS module, the same file the client imports.
import { upsertById } from '../../src/components/orders/helpers.js';

function assertEquals(a: unknown, b: unknown, msg?: string) {
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  if (sa !== sb) throw new Error(`${msg ?? 'not equal'}: ${sa} !== ${sb}`);
}

Deno.test('a line the realtime event already added is not added again', () => {
  // The event won the race: the line is in the list before addItems answers.
  const afterEvent = [{ id: 'a', qty: 1 }];
  const afterResponse = upsertById(afterEvent, [{ id: 'a', qty: 1, unit_price: 65000 }]);
  assertEquals(afterResponse.length, 1, 'one line, not two');
  assertEquals(afterResponse[0], { id: 'a', qty: 1, unit_price: 65000 });
});

Deno.test('a new line is appended, others are left alone', () => {
  assertEquals(upsertById([{ id: 'a' }], [{ id: 'b' }]), [{ id: 'a' }, { id: 'b' }]);
});

Deno.test('rows without an id and empty input are ignored', () => {
  assertEquals(upsertById([{ id: 'a' }], [null, {}, undefined]), [{ id: 'a' }]);
  assertEquals(upsertById(undefined, undefined), []);
});

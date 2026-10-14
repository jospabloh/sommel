// Lines whose `sent_at` is missing, null or not a string (an odd realtime
// payload, or a row written by hand) must sort without throwing: the station
// screen sorts them on every render, and `localeCompare` on a number used to
// blank the page. Zero external imports.
//   deno test --allow-env base44/tests/station_odd_shapes_test.ts
// @ts-ignore: plain JS module, the same file the client imports.
import { groupItemsByOrder, lineSubtitle, ticketHeat } from '../../src/components/stations/stationHelpers.js';

function assertEquals(a: unknown, b: unknown, msg?: string) {
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  if (sa !== sb) throw new Error(`${msg ?? 'not equal'}: ${sa} !== ${sb}`);
}

Deno.test('groupItemsByOrder sorts lines with odd sent_at without throwing', () => {
  const lines = [
    { id: 'a', order_id: 'o1', sent_at: 12345 },
    { id: 'b', order_id: 'o1', sent_at: null },
    { id: 'c', order_id: 'o1', sent_at: '2026-10-14T10:00:00Z' },
    { id: 'd', order_id: 'o1' },
    null,
    { id: 'e' },
  ];
  const grouped = groupItemsByOrder(lines);
  assertEquals([...grouped.keys()], ['o1']);
  assertEquals(grouped.get('o1').length, 4);
});

Deno.test('ticketHeat does not throw on lines with odd sent_at / station', () => {
  const lines = [{ id: 'a', order_id: 'o1', station: 'zzz', status: 'enviado', sent_at: 'no es fecha' }, { id: 'b', order_id: 'o1', station: 'bar', status: 'enviado', sent_at: 5 }];
  const r = ticketHeat(lines, new Date(), {});
  assertEquals(typeof r, 'object');
});

Deno.test('lineSubtitle skips null modifiers and extras instead of throwing', () => {
  assertEquals(lineSubtitle({ modifiers: [null, { key: 'a', label: 'En leche' }], extras: [undefined, { name: 'Shot' }] }), 'En leche · + Shot');
  assertEquals(lineSubtitle({ modifiers: null, extras: 'x' }), '');
});

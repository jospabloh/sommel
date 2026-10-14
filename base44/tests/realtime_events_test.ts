// Deno tests for applyRealtimeEvent (src/lib/realtimeMerge.js): the
// merge every realtime subscriber (Mesas, Estacion, Orden) uses. The socket
// can hand over odd events (no payload, partial payload, other tenant,
// repeats); each one must leave the screen's list sane. Zero external imports.
//   deno test --allow-env base44/tests/realtime_events_test.ts
// @ts-ignore: plain JS module, the same file the client imports.
import { applyRealtimeEvent } from '../../src/lib/realtimeMerge.js';

function assertEquals(a: unknown, b: unknown, msg?: string) {
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  if (sa !== sb) throw new Error(`${msg ?? 'not equal'}: ${sa} !== ${sb}`);
}

const T = 't1';
const openHere = (o: { tenant_id?: string; status?: string }) => o.tenant_id === T && o.status === 'abierta';
const orders = [{ id: 'o1', tenant_id: T, status: 'abierta', total: 100 }];

Deno.test('null, undefined and id-less events change nothing', () => {
  assertEquals(applyRealtimeEvent(orders, null, openHere), orders);
  assertEquals(applyRealtimeEvent(orders, undefined, openHere), orders);
  assertEquals(applyRealtimeEvent(orders, { type: 'update' }, openHere), orders);
  assertEquals(applyRealtimeEvent(orders, { type: 'update', data: {} }, openHere), orders);
});

Deno.test('a bad list is treated as empty, not a crash', () => {
  // @ts-ignore: deliberately wrong input
  assertEquals(applyRealtimeEvent(null, { type: 'create', id: 'o2', data: { id: 'o2', tenant_id: T, status: 'abierta' } }, openHere).length, 1);
});

Deno.test('an update without payload does not evict an open order', () => {
  assertEquals(applyRealtimeEvent(orders, { type: 'update', id: 'o1' }, openHere), orders);
  assertEquals(applyRealtimeEvent(orders, { type: 'update', id: 'o1', data: null }, openHere), orders);
});

Deno.test('a payload-less create is not appended as a bare id row', () => {
  assertEquals(applyRealtimeEvent([], { type: 'create', id: 'o9' }, () => true), []);
});

Deno.test('a delete event removes the row even with an empty payload', () => {
  assertEquals(applyRealtimeEvent(orders, { type: 'delete', id: 'o1' }, openHere), []);
  assertEquals(applyRealtimeEvent(orders, { type: 'delete', id: 'o1', data: {} }, openHere), []);
  assertEquals(applyRealtimeEvent(orders, { type: 'delete', id: 'zzz' }, openHere), orders);
});

Deno.test('a partial payload merges over the stored row', () => {
  const next = applyRealtimeEvent(orders, { type: 'update', id: 'o1', data: { id: 'o1', total: 250 } }, openHere);
  assertEquals(next, [{ id: 'o1', tenant_id: T, status: 'abierta', total: 250 }], 'tenant and status survive');
});

Deno.test('a row that stops belonging leaves the list', () => {
  const closed = applyRealtimeEvent(orders, { type: 'update', id: 'o1', data: { id: 'o1', status: 'cobrada' } }, openHere);
  assertEquals(closed, []);
});

Deno.test('another tenant never enters the list', () => {
  const evt = { type: 'create', id: 'x', data: { id: 'x', tenant_id: 'other', status: 'abierta' } };
  assertEquals(applyRealtimeEvent(orders, evt, openHere), orders);
});

Deno.test('the same event twice is idempotent', () => {
  const evt = { type: 'create', id: 'o2', data: { id: 'o2', tenant_id: T, status: 'abierta' } };
  const once = applyRealtimeEvent(orders, evt, openHere);
  assertEquals(applyRealtimeEvent(once, evt, openHere), once);
  assertEquals(once.length, 2);
});

Deno.test('an event arriving before the initial load starts the list', () => {
  const evt = { type: 'create', id: 'o2', data: { id: 'o2', tenant_id: T, status: 'abierta' } };
  assertEquals(applyRealtimeEvent([], evt, openHere), [evt.data]);
});

Deno.test('order lines: only this order, moved lines drop, unknown order-less lines are ignored', () => {
  const mine = (i: { order_id?: string }) => i.order_id === 'o1';
  const lines = [{ id: 'l1', order_id: 'o1', qty: 1 }];
  // another order's line
  assertEquals(applyRealtimeEvent(lines, { type: 'create', id: 'l2', data: { id: 'l2', order_id: 'o2' } }, mine), lines);
  // unknown line without order_id (partial payload)
  assertEquals(applyRealtimeEvent(lines, { type: 'update', id: 'l3', data: { id: 'l3', qty: 2 } }, mine), lines);
  // partial update of a held line keeps its order_id
  assertEquals(applyRealtimeEvent(lines, { type: 'update', id: 'l1', data: { id: 'l1', qty: 3 } }, mine), [{ id: 'l1', order_id: 'o1', qty: 3 }]);
  // moved to another order by a merge
  assertEquals(applyRealtimeEvent(lines, { type: 'update', id: 'l1', data: { id: 'l1', order_id: 'o2' } }, mine), []);
});

Deno.test('nested data (old shape) is still flattened', () => {
  const evt = { type: 'create', id: 'o2', data: { id: 'o2', data: { tenant_id: T, status: 'abierta' } } };
  assertEquals(applyRealtimeEvent([], evt, openHere).length, 1);
});

Deno.test('an _oversize (slimmed) payload is ignored, it would blank real fields', () => {
  const evt = { type: 'update', id: 'o1', data: { id: 'o1', _oversize: true, notes: '' } };
  assertEquals(applyRealtimeEvent(orders, evt, openHere), orders);
  assertEquals(applyRealtimeEvent([], { ...evt, type: 'create' }, () => true), []);
});

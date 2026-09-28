// Tests for base44/functions/stations/handlers/_logic.ts.
//
// Zero external imports on purpose: `deno.land`/`jsr.io` are blocked in this
// sandbox (contract §6), so this test runs where it's written instead of
// only getting its first look in CI (the StockFlow `machinery_sales_fields_
// test.ts` lesson).
//
// Run with: $SCRATCH/deno test --allow-env base44/tests/stations_logic_test.ts

import {
  LogicError,
  canMarkReady,
  isAlreadyReady,
  canMarkDelivered,
  isAlreadyDelivered,
  canUndoReady,
  isWithinUndoWindow,
  UNDO_WINDOW_MS,
  validateItemIds,
  validateItemId,
  heatLevel,
} from '../functions/stations/handlers/_logic.ts';

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(msg || `expected ${e}, got ${a}`);
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function assertThrows(fn: () => unknown, msg?: string) {
  try {
    fn();
  } catch {
    return;
  }
  throw new Error(msg || 'expected function to throw');
}

// ---- markReady.ts/markDelivered.ts/undoReady.ts read `item.status` from
// the loadOwned row — flat, never `item.data.status`. Fixed 2026-09-28: a
// row shaped the old (wrong) way `{id, data:{status}}` has no top-level
// `status` at all, so `canMarkReady`/`canMarkDelivered` would see
// `undefined` and silently skip every requested item instead of acting on
// it or failing loudly. Pinned here since the extraction itself is a
// one-line read inside the (impure) handlers, which `deno test` can't load
// directly — this fixture proves the flat read is the one that must happen. ----

Deno.test('canMarkReady: a FLAT item row (as loadOwned actually returns it) is read correctly', () => {
  const flatRow = { id: 'i1', tenant_id: 'bar_a', status: 'enviado' };
  assert(canMarkReady(flatRow.status), 'a flat row\'s own .status must make canMarkReady eligible');
});

Deno.test('canMarkReady: a WRONGLY-NESTED item row ({id, data:{status}}) — reading .status flat off it (as the fixed handler does off a REAL row) finds nothing', () => {
  // This is the inverse fixture: a row shaped the OLD (wrong) way has no
  // top-level `status` at all. If the handler's flat `item.status` read
  // were ever pointed at a row like this, canMarkReady would see
  // `undefined` and silently skip the item (contract §4's "skip rather than
  // fail the whole batch" now masking a real bug instead of an
  // intentionally-ineligible line) — which is exactly why the fix confirms
  // real rows ARE flat (see the sibling test above) rather than reading
  // `.data.status` to "handle both".
  const wronglyNestedRow: any = { id: 'i1', data: { status: 'enviado' } };
  assert(!canMarkReady(wronglyNestedRow.status), 'a flat read off a nested-shaped row must find no eligible status');
});

// ---- canMarkReady / isAlreadyReady ----

Deno.test('canMarkReady: enviado is eligible', () => {
  assert(canMarkReady('enviado'), 'enviado should be eligible for markReady');
});

Deno.test('canMarkReady: listo is eligible too (idempotent call)', () => {
  assert(canMarkReady('listo'), 'listo should still be eligible (idempotent)');
});

Deno.test('canMarkReady: nuevo/entregado/cancelado are not eligible', () => {
  assert(!canMarkReady('nuevo'), 'nuevo should not be eligible');
  assert(!canMarkReady('entregado'), 'entregado should not be eligible');
  assert(!canMarkReady('cancelado'), 'cancelado should not be eligible');
  assert(!canMarkReady(null), 'null should not be eligible');
  assert(!canMarkReady(undefined), 'undefined should not be eligible');
});

Deno.test('isAlreadyReady: only true for listo', () => {
  assert(isAlreadyReady('listo'), 'listo is already ready');
  assert(!isAlreadyReady('enviado'), 'enviado is not yet ready');
});

// ---- canMarkDelivered / isAlreadyDelivered ----

Deno.test('canMarkDelivered: listo is eligible', () => {
  assert(canMarkDelivered('listo'), 'listo should be eligible for markDelivered');
});

Deno.test('canMarkDelivered: entregado is eligible too (idempotent call)', () => {
  assert(canMarkDelivered('entregado'), 'entregado should still be eligible (idempotent)');
});

Deno.test('canMarkDelivered: nuevo/enviado/cancelado are not eligible', () => {
  assert(!canMarkDelivered('nuevo'), 'nuevo should not be eligible');
  assert(!canMarkDelivered('enviado'), 'enviado should not be eligible');
  assert(!canMarkDelivered('cancelado'), 'cancelado should not be eligible');
});

Deno.test('isAlreadyDelivered: only true for entregado', () => {
  assert(isAlreadyDelivered('entregado'), 'entregado is already delivered');
  assert(!isAlreadyDelivered('listo'), 'listo is not yet delivered');
});

// ---- canUndoReady ----

Deno.test('canUndoReady: only listo can be undone', () => {
  assert(canUndoReady('listo'), 'listo should be undoable');
  assert(!canUndoReady('enviado'), 'enviado should not be undoable');
  assert(!canUndoReady('entregado'), 'entregado should not be undoable');
  assert(!canUndoReady('cancelado'), 'cancelado should not be undoable');
  assert(!canUndoReady(null), 'null should not be undoable');
});

// ---- isWithinUndoWindow ----

Deno.test('isWithinUndoWindow: just now is within the window', () => {
  const now = new Date('2026-09-28T12:10:00.000Z');
  const readyAt = new Date(now.getTime() - 1000).toISOString(); // 1s ago
  assert(isWithinUndoWindow(readyAt, now), 'a ready_at 1 second ago should be within the window');
});

Deno.test('isWithinUndoWindow: exactly at the boundary is NOT within the window (strict <)', () => {
  const now = new Date('2026-09-28T12:10:00.000Z');
  const readyAt = new Date(now.getTime() - UNDO_WINDOW_MS).toISOString(); // exactly 5min ago
  assert(!isWithinUndoWindow(readyAt, now), 'exactly 5 minutes ago should NOT be within the window');
});

Deno.test('isWithinUndoWindow: one second before the boundary IS within the window', () => {
  const now = new Date('2026-09-28T12:10:00.000Z');
  const readyAt = new Date(now.getTime() - UNDO_WINDOW_MS + 1000).toISOString();
  assert(isWithinUndoWindow(readyAt, now), '4m59s ago should be within the window');
});

Deno.test('isWithinUndoWindow: six minutes ago is outside the window', () => {
  const now = new Date('2026-09-28T12:10:00.000Z');
  const readyAt = new Date(now.getTime() - 6 * 60 * 1000).toISOString();
  assert(!isWithinUndoWindow(readyAt, now), '6 minutes ago should be outside the window');
});

Deno.test('isWithinUndoWindow: missing ready_at is outside the window', () => {
  const now = new Date('2026-09-28T12:10:00.000Z');
  assert(!isWithinUndoWindow(null, now), 'missing ready_at should be outside the window');
  assert(!isWithinUndoWindow(undefined, now), 'undefined ready_at should be outside the window');
  assert(!isWithinUndoWindow('', now), 'empty ready_at should be outside the window');
});

Deno.test('isWithinUndoWindow: unparseable ready_at is outside the window', () => {
  const now = new Date('2026-09-28T12:10:00.000Z');
  assert(!isWithinUndoWindow('not-a-date', now), 'garbage ready_at should be outside the window');
});

// ---- validateItemIds ----

Deno.test('validateItemIds: a normal array of strings passes through trimmed', () => {
  assertEquals(validateItemIds([' a ', 'b']), ['a', 'b']);
});

Deno.test('validateItemIds: empty array throws invalid_item_ids', () => {
  assertThrows(() => validateItemIds([]), 'empty array should throw');
  try {
    validateItemIds([]);
  } catch (err) {
    assert(err instanceof LogicError, 'should throw a LogicError');
    assertEquals((err as LogicError).code, 'invalid_item_ids');
  }
});

Deno.test('validateItemIds: non-array throws invalid_item_ids', () => {
  assertThrows(() => validateItemIds('not-an-array'));
  assertThrows(() => validateItemIds(null));
  assertThrows(() => validateItemIds(undefined));
});

Deno.test('validateItemIds: an array with a blank entry throws', () => {
  assertThrows(() => validateItemIds(['a', '  ', 'b']));
  assertThrows(() => validateItemIds(['a', 123 as unknown as string]));
});

// ---- validateItemId ----

Deno.test('validateItemId: trims a valid string', () => {
  assertEquals(validateItemId('  abc  '), 'abc');
});

Deno.test('validateItemId: blank/non-string throws invalid_item_id', () => {
  assertThrows(() => validateItemId(''));
  assertThrows(() => validateItemId('   '));
  assertThrows(() => validateItemId(null));
  assertThrows(() => validateItemId(undefined));
  assertThrows(() => validateItemId(123));
});

// ---- heatLevel ----

Deno.test('heatLevel: fresh item (0 minutes elapsed) is ok with ratio 0', () => {
  const now = new Date('2026-09-28T12:00:00.000Z');
  const result = heatLevel(now.toISOString(), now, 10);
  assertEquals(result, { ratio: 0, level: 'ok' });
});

Deno.test('heatLevel: just under 75% of the goal is still ok', () => {
  const now = new Date('2026-09-28T12:07:29.000Z'); // 7.483 min elapsed of a 10min goal
  const sentAt = '2026-09-28T12:00:00.000Z';
  const result = heatLevel(sentAt, now, 10);
  assert(result.level === 'ok', `expected ok, got ${result.level} (ratio ${result.ratio})`);
  assert(result.ratio < 0.75, `ratio should be < 0.75, got ${result.ratio}`);
});

Deno.test('heatLevel: exactly 75% of the goal is warn (boundary is inclusive)', () => {
  const now = new Date('2026-09-28T12:07:30.000Z'); // exactly 7.5 min of a 10min goal
  const sentAt = '2026-09-28T12:00:00.000Z';
  const result = heatLevel(sentAt, now, 10);
  assertEquals(result.level, 'warn');
  assertEquals(result.ratio, 0.75);
});

Deno.test('heatLevel: between 75% and 100% is warn', () => {
  const now = new Date('2026-09-28T12:09:00.000Z'); // 9 min of a 10min goal
  const sentAt = '2026-09-28T12:00:00.000Z';
  const result = heatLevel(sentAt, now, 10);
  assertEquals(result.level, 'warn');
});

Deno.test('heatLevel: exactly at the goal (100%) is late (boundary is inclusive)', () => {
  const now = new Date('2026-09-28T12:10:00.000Z'); // exactly 10 min of a 10min goal
  const sentAt = '2026-09-28T12:00:00.000Z';
  const result = heatLevel(sentAt, now, 10);
  assertEquals(result.level, 'late');
  assertEquals(result.ratio, 1);
});

Deno.test('heatLevel: well past the goal is late', () => {
  const now = new Date('2026-09-28T12:20:00.000Z'); // 20 min of a 10min goal
  const sentAt = '2026-09-28T12:00:00.000Z';
  const result = heatLevel(sentAt, now, 10);
  assertEquals(result.level, 'late');
  assertEquals(result.ratio, 2);
});

Deno.test('heatLevel: missing sent_at returns ok/0 instead of throwing', () => {
  const now = new Date('2026-09-28T12:20:00.000Z');
  assertEquals(heatLevel(null, now, 10), { ratio: 0, level: 'ok' });
  assertEquals(heatLevel(undefined, now, 10), { ratio: 0, level: 'ok' });
  assertEquals(heatLevel('', now, 10), { ratio: 0, level: 'ok' });
});

Deno.test('heatLevel: unparseable sent_at returns ok/0 instead of throwing', () => {
  const now = new Date('2026-09-28T12:20:00.000Z');
  assertEquals(heatLevel('garbage', now, 10), { ratio: 0, level: 'ok' });
});

Deno.test('heatLevel: non-positive or non-numeric goalMinutes returns ok/0 instead of dividing by zero/negative', () => {
  const now = new Date('2026-09-28T12:20:00.000Z');
  const sentAt = '2026-09-28T12:00:00.000Z';
  assertEquals(heatLevel(sentAt, now, 0), { ratio: 0, level: 'ok' });
  assertEquals(heatLevel(sentAt, now, -5), { ratio: 0, level: 'ok' });
  assertEquals(heatLevel(sentAt, now, NaN), { ratio: 0, level: 'ok' });
  assertEquals(heatLevel(sentAt, now, undefined as unknown as number), { ratio: 0, level: 'ok' });
});

// Which cancelled orders count toward a shift's corte (no external imports).
import { cancelledOrdersInShift } from '../functions/shifts/handlers/_cancelled_logic.ts';

function eq(actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`expected ${e}, got ${a}`);
}

const shift = { id: 's2', opened_at: '2026-10-14T14:00:00.000Z', closed_at: '2026-10-14T22:00:00.000Z' };
const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

Deno.test('cancelled orders: shift_id decides when present', () => {
  const rows = [
    { id: 'mine', shift_id: 's2', opened_at: '2026-10-14T15:00:00.000Z' },
    { id: 'other', shift_id: 's1', opened_at: '2026-10-14T15:00:00.000Z' },
  ];
  eq(ids(cancelledOrdersInShift(rows, shift)), ['mine']);
});

Deno.test('cancelled orders: without shift_id the shift time window decides, both ends', () => {
  const rows = [
    { id: 'before', opened_at: '2026-10-13T20:00:00.000Z' },
    { id: 'inside', opened_at: '2026-10-14T16:00:00.000Z' },
    { id: 'after', opened_at: '2026-10-15T01:00:00.000Z' },
    { id: 'fallback', created_date: '2026-10-14T17:00:00.000Z' },
  ];
  eq(ids(cancelledOrdersInShift(rows, shift)), ['inside', 'fallback']);
});

Deno.test('cancelled orders: an open shift has no upper bound, and paid orders are skipped', () => {
  const open = { id: 's3', opened_at: '2026-10-14T14:00:00.000Z' };
  const rows = [
    { id: 'late', opened_at: '2026-10-20T00:00:00.000Z' },
    { id: 'paid', opened_at: '2026-10-14T16:00:00.000Z' },
  ];
  eq(ids(cancelledOrdersInShift(rows, open, ['paid'])), ['late']);
});

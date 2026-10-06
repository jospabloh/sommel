// The combined "Cocina y barra" view (docs/modo-terminal-diseno.md): which
// stations a route shows, the quick filter, and per-station heat.
// @ts-ignore: plain JS module, the same file the client imports.
import {
  COMBINED_VIEW,
  linesForFilter,
  normalizeCombinedFilter,
  stationsForView,
  ticketHeat,
} from '../../src/components/stations/stationHelpers.js';

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg ?? 'assertEquals'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const NOW = new Date('2026-10-06T20:00:00Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60000).toISOString();
const bar = { prep_goal_kitchen_min: 15, prep_goal_bar_min: 8 };

Deno.test('the combined view shows both stations; a single station shows only itself', () => {
  assertEquals(stationsForView(COMBINED_VIEW), ['kitchen', 'bar']);
  assertEquals(stationsForView('kitchen'), ['kitchen']);
  assertEquals(stationsForView('bar'), ['bar']);
});

Deno.test('an unknown route shows nothing, never every station', () => {
  assertEquals(stationsForView('impresion'), []);
  assertEquals(stationsForView(undefined), []);
});

Deno.test('a stored filter that is not a real option falls back to everything', () => {
  assertEquals(normalizeCombinedFilter('bar'), 'bar');
  assertEquals(normalizeCombinedFilter('cocina'), 'all');
  assertEquals(normalizeCombinedFilter(null), 'all');
});

Deno.test('the Barra filter never shows a kitchen line', () => {
  const lines = [{ id: 'a', station: 'kitchen' }, { id: 'b', station: 'bar' }];
  assertEquals(linesForFilter(lines, 'bar').map((l: { id: string }) => l.id), ['b']);
  assertEquals(linesForFilter(lines, 'all').map((l: { id: string }) => l.id), ['a', 'b']);
});

Deno.test('each line is measured against its own station goal, and the ticket shows the worst', () => {
  // 10 min: on time for the kitchen (15), late for the bar (8).
  const lines = [
    { id: 'k', station: 'kitchen', status: 'enviado', sent_at: minutesAgo(10) },
    { id: 'b', station: 'bar', status: 'enviado', sent_at: minutesAgo(10) },
  ];
  assertEquals(ticketHeat(lines, NOW, bar).level, 'late');
  assertEquals(ticketHeat([lines[0]], NOW, bar).level, 'ok');
});

Deno.test('a station whose lines were all cancelled does not heat the ticket', () => {
  const lines = [
    { id: 'k', station: 'kitchen', status: 'enviado', sent_at: minutesAgo(2) },
    { id: 'b', station: 'bar', status: 'cancelado', sent_at: minutesAgo(30) },
  ];
  assertEquals(ticketHeat(lines, NOW, bar).level, 'ok');
});

Deno.test('with one station the heat matches the single-station screen', () => {
  const lines = [{ id: 'k', station: 'kitchen', status: 'listo', sent_at: minutesAgo(12) }];
  assertEquals(ticketHeat(lines, NOW, bar).level, 'warn'); // 12/15 = 0.8
});

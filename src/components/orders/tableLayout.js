// Pure helper for TableMap (Deno-tested in base44/tests/cancel_order_test.ts,
// so it has zero imports). A table is "placed" only when it has numeric x AND y.
// Tables without coordinates must never be drawn at 0,0 on top of each other:
// they go to the automatic grid, whether or not other tables are placed.

export function hasCoords(t) {
  return typeof t?.x === 'number' && typeof t?.y === 'number' && Number.isFinite(t.x) && Number.isFinite(t.y);
}

/** { placed, unplaced }: placed tables keep their map position, the rest go to the grid. */
export function splitTablesByPlacement(tables) {
  const list = Array.isArray(tables) ? tables.filter(Boolean) : [];
  return { placed: list.filter(hasCoords), unplaced: list.filter((t) => !hasCoords(t)) };
}

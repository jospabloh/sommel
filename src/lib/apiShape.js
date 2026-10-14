// Function replies are lists of records; a `null` (or undefined) element in
// one has no meaning, and every screen that loops the list reads a field of
// each row (`r.name`, `m.label`, `s.id`), so a single hole used to blank the
// whole screen. callFn drops them before any screen sees the reply.
// Only holes in lists OF RECORDS are removed (an array with at least one
// object). A list of numbers keeps its nulls: there a null can be a position,
// like an hour with no sales, and dropping it would shift every value after
// it. Nothing here invents or changes a value. No imports: tested in Deno
// (base44/tests/api_shape_test.ts).

/**
 * @param {any} value a parsed reply body
 * @returns {any} the same data with null/undefined array elements removed at any depth
 */
export function dropNullItems(value) {
  if (Array.isArray(value)) {
    const ofRecords = value.some((x) => x !== null && typeof x === 'object');
    // A list of nothing but holes is a list of no records ([null] from a lookup that missed).
    const allHoles = value.every((x) => x === null || x === undefined);
    return (ofRecords || allHoles ? value.filter((x) => x !== null && x !== undefined) : value).map(dropNullItems);
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = dropNullItems(v);
    return out;
  }
  return value;
}

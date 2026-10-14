// Function replies are lists of records; a `null` (or undefined) element in
// one has no meaning, and every screen that loops the list reads a field of
// each row (`r.name`, `m.label`, `s.id`), so a single hole used to blank the
// whole screen. callFn drops them before any screen sees the reply.
// Only holes are removed: an array of numbers or ids passes through as it was,
// and nothing here invents or changes a value. No imports: tested in Deno
// (base44/tests/api_shape_test.ts).

/**
 * @param {any} value a parsed reply body
 * @returns {any} the same data with null/undefined array elements removed at any depth
 */
export function dropNullItems(value) {
  if (Array.isArray(value)) {
    return value.filter((x) => x !== null && x !== undefined).map(dropNullItems);
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = dropNullItems(v);
    return out;
  }
  return value;
}

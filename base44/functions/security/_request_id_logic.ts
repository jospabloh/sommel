// Pure check for ids that arrive from a URL (/aprobar/:id). Base44 ids are 24
// hex characters; querying the entity with anything else makes the backend
// throw a cast error (a 500) instead of returning no rows. No imports.
export function isPlausibleRecordId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{24}$/i.test(value);
}

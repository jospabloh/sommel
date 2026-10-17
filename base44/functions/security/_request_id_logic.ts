// Pure check for ids that arrive from a URL (/aprobar/:id). Base44 ids are 24
// hex characters; querying the entity with anything else makes the backend
// throw a cast error (a 500) instead of returning no rows. The same code runs
// on Supabase (docs/migracion-supabase.md, phase 2), where ids are uuids, so
// both shapes are plausible. No imports.
const BASE44_ID = /^[0-9a-f]{24}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPlausibleRecordId(value: unknown): value is string {
  return typeof value === 'string' && (BASE44_ID.test(value) || UUID.test(value));
}

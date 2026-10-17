// Supabase stand-in for base44/functions/security/_request_id_logic.ts, written
// over it by `npm run generate:supabase-functions`. Same export and meaning:
// an id from a URL (/aprobar/:id) that is not plausible answers 404 without a
// query. On Base44 ids are 24 hex characters; here they are uuids. (The
// entities shim already turns a non-uuid into "no rows"; this keeps the
// handler's early 404 exactly as it is on Base44.) No imports.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPlausibleRecordId(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

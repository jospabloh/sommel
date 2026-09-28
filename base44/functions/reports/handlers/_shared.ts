// Impure helpers for the `reports` handlers (kept apart from `_logic.ts`,
// which must stay import-free for `deno test`).
//
// Range operators: the SDK types accept `$gte`/`$lt`/`$in` in filter queries
// (EntityFilterQuery), so we ask the server to narrow by date. If the backend
// rejects an operator we retry without it, and in every case the aggregation
// re-narrows in memory (`inWindow`), so a server that ignored an operator
// still yields correct numbers, only slower.
import { HttpError } from '../_guard.ts';
import { LogicError } from './_logic.ts';

/** Runs pure logic and maps its LogicError to a 400 HttpError. */
export function guardLogic<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof LogicError) throw new HttpError(400, err.code, err.message);
    throw err;
  }
}

const PAGE = 500;
const MAX_ROWS = 50_000;

/** Reads every row for a query (Base44 caps a single filter page). */
export async function fetchAll(client: any, query: Record<string, unknown>): Promise<any[]> {
  const out: any[] = [];
  for (let skip = 0; skip < MAX_ROWS; skip += PAGE) {
    const rows = await client.filter(query, 'created_date', PAGE, skip);
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

/** fetchAll with a range query first; falls back to `baseQuery` alone if the range is rejected. */
export async function fetchRanged(
  client: any,
  baseQuery: Record<string, unknown>,
  rangeQuery: Record<string, unknown>
): Promise<any[]> {
  try {
    return await fetchAll(client, { ...baseQuery, ...rangeQuery });
  } catch {
    return await fetchAll(client, baseQuery);
  }
}

/** Reads rows whose `field` is in `ids`, in chunks, a few chunks at a time. */
export async function fetchByIds(
  client: any,
  baseQuery: Record<string, unknown>,
  field: string,
  ids: string[]
): Promise<any[]> {
  const CHUNK = 100;
  const PARALLEL = 5;
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));
  const out: any[] = [];
  for (let i = 0; i < chunks.length; i += PARALLEL) {
    const batch = await Promise.all(
      chunks.slice(i, i + PARALLEL).map((chunk) => fetchAll(client, { ...baseQuery, [field]: { $in: chunk } }))
    );
    for (const rows of batch) out.push(...rows);
  }
  return out;
}

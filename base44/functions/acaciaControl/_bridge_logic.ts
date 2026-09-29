// Pure logic for the acaciaControl bridge. Zero external imports (only the
// shared signer) so `deno test` loads it in a sandbox where deno.land and
// jsr.io are blocked. entry.ts does the network I/O; every decision that can be
// wrong lives here, where base44/tests/bridge_test.ts pins it.
import { verifyAs } from './_acaciaSign.ts';

/** Reads and writes are pinned to these entities. Mission Control names the
 *  entity in every call (its registry `config`), but the bridge never lets the
 *  caller pick an arbitrary one: a signed body must not turn this function into
 *  a generic "read or patch any table" endpoint. */
export const LICENSE_ENTITY = 'WineBar';
export const TICKET_ENTITY = 'SupportTicket';
export const SESSION_ENTITY = 'AppSession';

/** Entities whose row counts Mission Control may read (counts only, never rows). */
export const USAGE_ENTITIES = [
  'WineBar', 'User', 'Order', 'OrderItem', 'Payment', 'Product', 'Category',
  'BarTable', 'Shift', 'Attendance', 'InventoryItem', 'InventoryMovement',
  'CashMovement', 'StaffInvite', 'SupportTicket', 'PrintJob',
] as const;

export const BILLING_STATUSES = ['trial', 'active', 'view_only', 'suspended'] as const;

/** The only WineBar fields the platform may write through license.set. */
export const LICENSE_FIELDS = ['billing_status', 'trial_end_at', 'current_period_end', 'plan'] as const;

export const COUNT_CAP = 5000; // Base44 caps list() at 5,000; counts are capped here.
export const MAX_REVOKE_IDS = 200;

export type Env = { secret?: string | null; slug?: string | null };
export type Gate =
  | { ok: true; action: string; params: Record<string, unknown> }
  | { ok: false; status: number; error: string; code: string };

/** Order matters: not configured (503) -> malformed (400) -> signature (401).
 *  Secrets unset means FAIL CLOSED: nothing is verified, nothing is served. */
export async function authorizeBridge(env: Env, body: unknown, now = Date.now()): Promise<Gate> {
  if (!env.secret || !env.slug) {
    return { ok: false, status: 503, error: 'Puente no configurado', code: 'bridge_not_configured' };
  }
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const { action, ts, sig } = b;
  const params = b.params === undefined ? {} : b.params;
  if (typeof action !== 'string' || !action || !ts || typeof sig !== 'string' || !sig) {
    return { ok: false, status: 400, error: 'missing action/ts/sig', code: 'bad_request' };
  }
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    return { ok: false, status: 400, error: 'params must be an object', code: 'bad_request' };
  }
  const valid = await verifyAs(env.secret, env.slug, {
    ts: ts as string | number, action, params, sig, now,
  });
  if (!valid) return { ok: false, status: 401, error: 'bad signature', code: 'bad_signature' };
  return { ok: true, action, params: params as Record<string, unknown> };
}

/** null when `entity` is the one this action is allowed to touch. */
export function entityError(expected: string, entity: unknown): string | null {
  return entity === expected ? null : `params.entity must be ${expected}`;
}

/** The license-relevant slice of a WineBar row. Mission Control's field_map
 *  reads exactly these names; nothing else about the bar leaves the backend. */
export function projectWineBar(rec: Record<string, unknown> | null | undefined) {
  const r = rec ?? {};
  return {
    id: r.id ?? null,
    name: r.name ?? null,
    plan: r.plan ?? null,
    billing_status: r.billing_status ?? null,
    trial_end_at: r.trial_end_at ?? null,
    current_period_end: r.current_period_end ?? null,
    owner_id: r.owner_id ?? null,
    created_date: r.created_date ?? null,
    updated_date: r.updated_date ?? null,
  };
}

function normalizeDate(v: unknown): string | null | undefined {
  if (v === null) return null;
  if (typeof v !== 'string' || !v) return undefined;
  const t = Date.parse(v);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString();
}

/** Validates the patch Mission Control wants to apply to a WineBar. Unknown
 *  fields are an error, not silently dropped: a typo must not look like success. */
export function sanitizeLicensePatch(
  patch: unknown,
): { patch: Record<string, unknown> } | { error: string } {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return { error: 'params.patch required' };
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    if (!(LICENSE_FIELDS as readonly string[]).includes(k)) return { error: `field not allowed: ${k}` };
    if (k === 'billing_status') {
      if (!(BILLING_STATUSES as readonly string[]).includes(v as string)) {
        return { error: `invalid billing_status: ${String(v)}` };
      }
      out[k] = v;
    } else if (k === 'plan') {
      if (v !== null && (typeof v !== 'string' || v.length > 60)) return { error: 'invalid plan' };
      out[k] = v;
    } else {
      const d = normalizeDate(v);
      if (d === undefined) return { error: `invalid date: ${k}` };
      out[k] = d;
    }
  }
  if (Object.keys(out).length === 0) return { error: 'params.patch is empty' };
  return { patch: out };
}

/** usage.summary: only known entities are counted; anything else is null. */
export function usageEntities(requested: unknown): string[] {
  return Array.isArray(requested) ? requested.filter((e): e is string => typeof e === 'string') : [];
}
export function isUsageEntity(e: string): boolean {
  return (USAGE_ENTITIES as readonly string[]).includes(e);
}

/** usage.byTenant: { id, count } only, no row data, busiest first. */
export function countByField(rows: Array<Record<string, unknown>>, field: string, limit = 50) {
  const counts: Record<string, number> = {};
  for (const r of rows) {
    const k = r?.[field];
    if (k) counts[String(k)] = (counts[String(k)] ?? 0) + 1;
  }
  return Object.entries(counts)
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function cleanRevokeIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  const seen = new Set<string>();
  for (const id of ids) if (typeof id === 'string' && id) seen.add(id);
  return [...seen].slice(0, MAX_REVOKE_IDS);
}

/** What a force-logout writes. The client's heartbeat reads revoked_at. */
export function revokePatch(nowIso: string, actorEmail: unknown) {
  return { revoked_at: nowIso, revoked_by: typeof actorEmail === 'string' ? actorEmail : null };
}

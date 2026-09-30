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

// ── tickets.update ───────────────────────────────────────────────────────────

/** SupportTicket.status enum (base44/entities/SupportTicket.jsonc). */
export const TICKET_STATUSES = ['abierto', 'en_proceso', 'cerrado'] as const;

/** Mission Control may only change a ticket's status. Sommel tickets carry a
 *  single `body` and no thread entity, so a reply (message / appendItem) is
 *  refused instead of being written somewhere the bar would never see it. */
export function sanitizeTicketUpdate(
  params: Record<string, unknown>,
): { id: string; patch: { status: string } } | { error: string } {
  const bad = entityError(TICKET_ENTITY, params.entity);
  if (bad) return { error: bad };
  if (typeof params.id !== 'string' || !params.id) return { error: 'params.id required' };
  if (params.message || params.messageEntity || params.appendField || params.appendItem) {
    return { error: 'replies not supported: Sommel tickets have no thread' };
  }
  const patch = params.patch;
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return { error: 'params.patch required' };
  const keys = Object.keys(patch);
  if (keys.length !== 1 || keys[0] !== 'status') return { error: 'only patch.status is allowed' };
  const status = (patch as Record<string, unknown>).status;
  if (!(TICKET_STATUSES as readonly string[]).includes(status as string)) {
    return { error: `invalid status: ${String(status)}` };
  }
  return { id: params.id, patch: { status: status as string } };
}

// ── tenants.contacts / emails.sendFollowup ──────────────────────────────────

const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;
export const MAX_SUBJECT = 200;
export const MAX_HTML = 200_000;

export function normEmail(v: unknown): string {
  return typeof v === 'string' ? v.trim().toLowerCase() : '';
}

type Row = Record<string, unknown>;

/** One contact per live bar: its owner if still a bar_admin of it, else the
 *  oldest bar_admin. Archived bars get no contact (they asked to leave). The
 *  recipient spec Mission Control sends is ignored: who speaks for a bar is
 *  Sommel's rule, not the caller's. */
export function barContacts(bars: Row[], users: Row[]) {
  const out: Array<{ id: string; name: string | null; email: string | null }> = [];
  for (const bar of bars) {
    if (!bar?.id || bar.archived_at) continue;
    const admins = users
      .filter((u) => u?.tenant_id === bar.id && u?.app_role === 'bar_admin' && normEmail(u.email))
      .sort((a, b) => String(a.created_date ?? '').localeCompare(String(b.created_date ?? '')));
    const pick = admins.find((u) => u.id === bar.owner_id) ?? admins[0] ?? null;
    out.push({
      id: String(bar.id),
      name: typeof bar.name === 'string' ? bar.name : null,
      email: pick ? normEmail(pick.email) : null,
    });
  }
  return out;
}

/** Validates an emails.sendFollowup request and decides whether `to` may
 *  receive it. A signed body alone must not turn this into "email anyone":
 *  - internal (ops notices: new ticket, new bar) → only ACACIA's own
 *    addresses: the acaciaco.com.mx domain or the owner/support secrets.
 *  - otherwise → only a current bar contact (see barContacts). */
export function checkFollowup(
  params: Record<string, unknown>,
  allowed: { internal: string[]; contacts: string[] },
): { to: string; subject: string; html: string; internal: boolean } | { error: string; status: number } {
  const to = normEmail(params.to);
  const subject = typeof params.subject === 'string' ? params.subject.trim() : '';
  const html = typeof params.html === 'string' ? params.html : '';
  if (!to || !subject || !html) return { error: 'params.to/subject/html required', status: 400 };
  if (!EMAIL_RE.test(to)) return { error: 'invalid params.to', status: 400 };
  if (subject.length > MAX_SUBJECT || /[\r\n]/.test(subject)) return { error: 'invalid params.subject', status: 400 };
  if (html.length > MAX_HTML) return { error: 'params.html too large', status: 400 };
  const internal = params.internal === true;
  const ok = internal
    ? to.endsWith('@acaciaco.com.mx') || allowed.internal.map(normEmail).includes(to)
    : allowed.contacts.map(normEmail).includes(to);
  if (!ok) return { error: 'recipient not allowed', status: 403 };
  return { to, subject, html, internal };
}

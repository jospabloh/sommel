// Pure logic for settings.platformSetLicense / platformListBars (zero imports,
// so `deno test` loads it in the sandbox). The field rules deliberately mirror
// `sanitizeLicensePatch` in acaciaControl/_bridge_logic.ts: the same four
// platform-owned WineBar fields, validated the same way. Deno cannot import
// across function directories, so the rules are restated here and
// base44/tests/platform_bars_test.ts pins both copies to the same behavior.

export const BILLING_STATUSES = ['trial', 'active', 'view_only', 'suspended'] as const;
export const LICENSE_FIELDS = ['billing_status', 'trial_end_at', 'current_period_end', 'plan'] as const;
export const AUDIT_NOTE_MAX = 300;
/** Newest entries win; the array is a trail, not an archive. */
export const AUDIT_MAX_ENTRIES = 100;

export type LicenseAuditEntry = {
  by: string;
  at: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  note: string;
};

function normalizeDate(v: unknown): string | null | undefined {
  if (v === null) return null;
  if (typeof v !== 'string' || !v) return undefined;
  const t = Date.parse(v);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString();
}

/** Unknown fields are an error, not silently dropped: a typo must not look like success. */
export function validateLicensePatch(
  patch: unknown,
): { patch: Record<string, unknown> } | { error: string } {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return { error: 'Faltan los cambios de licencia' };
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    if (!(LICENSE_FIELDS as readonly string[]).includes(k)) return { error: `Campo no permitido: ${k}` };
    if (k === 'billing_status') {
      if (!(BILLING_STATUSES as readonly string[]).includes(v as string)) {
        return { error: 'Estado de licencia no válido' };
      }
      out[k] = v;
    } else if (k === 'plan') {
      if (v !== null && (typeof v !== 'string' || v.length > 60)) return { error: 'Plan no válido' };
      out[k] = v;
    } else {
      const d = normalizeDate(v);
      if (d === undefined) return { error: `Fecha no válida: ${k}` };
      out[k] = d;
    }
  }
  if (Object.keys(out).length === 0) return { error: 'No hay cambios que guardar' };
  return { patch: out };
}

export function cleanNote(note: unknown): string {
  return typeof note === 'string' ? note.trim().slice(0, AUDIT_NOTE_MAX) : '';
}

/** Only the fields that actually change; a no-op patch yields null. */
export function diffLicense(
  bar: Record<string, unknown>,
  patch: Record<string, unknown>,
): { before: Record<string, unknown>; after: Record<string, unknown> } | null {
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    const cur = bar?.[k] ?? null;
    const same = k.endsWith('_at') || k === 'current_period_end'
      ? (cur === null ? null : normalizeDate(cur as string) ?? cur) === v
      : cur === v;
    if (!same) {
      before[k] = cur;
      after[k] = v;
    }
  }
  return Object.keys(after).length === 0 ? null : { before, after };
}

export function appendAudit(
  existing: unknown,
  entry: LicenseAuditEntry,
): LicenseAuditEntry[] {
  const list = Array.isArray(existing) ? (existing as LicenseAuditEntry[]) : [];
  return [...list, entry].slice(-AUDIT_MAX_ENTRIES);
}

/** What the platform list shows per bar. Nothing else about a bar leaves. */
export function projectBar(bar: Record<string, unknown>, stats: { products: number; orders: number; revenue_cents: number }) {
  const audit = Array.isArray(bar?.license_audit) ? (bar.license_audit as LicenseAuditEntry[]) : [];
  return {
    id: bar?.id ?? null,
    name: bar?.name ?? '',
    address: bar?.address ?? '',
    plan: bar?.plan ?? null,
    billing_status: bar?.billing_status ?? 'trial',
    trial_end_at: bar?.trial_end_at ?? null,
    current_period_end: bar?.current_period_end ?? null,
    archived_at: bar?.archived_at ?? null,
    products: stats.products,
    orders: stats.orders,
    revenue_cents: stats.revenue_cents,
    last_license_change: audit.length ? audit[audit.length - 1] : null,
  };
}

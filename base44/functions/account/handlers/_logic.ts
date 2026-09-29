// Pure rules for the `account` endpoint (module 7). ZERO imports on purpose,
// so `deno test` runs it in a sandbox without deno.land/jsr.io.

export type AccountDenial =
  | 'platform_account'
  | 'not_owner'
  | 'owner_locked'
  | 'last_admin'
  | 'not_found'
  | 'self_target'
  | 'target_not_admin';

export const ACCOUNT_DENIAL_STATUS: Record<AccountDenial, number> = {
  platform_account: 403,
  not_owner: 403,
  owner_locked: 409,
  last_admin: 409,
  not_found: 404,
  self_target: 400,
  target_not_admin: 409,
};

export const ACCOUNT_DENIAL_MESSAGE: Record<AccountDenial, string> = {
  platform_account: 'La cuenta de plataforma no se elimina desde aquí',
  not_owner: 'Solo el dueño del bar puede hacer esto',
  owner_locked: 'Eres el dueño del bar: cede el bar a otro administrador o dalo de baja antes de eliminar tu cuenta',
  last_admin: 'El bar no puede quedarse sin administrador. Nombra a otra persona antes',
  not_found: 'Esa persona ya no está en el equipo',
  self_target: 'Elige a otra persona',
  target_not_admin: 'Solo puedes ceder el bar a otro administrador del mismo bar',
};

export interface MemberLike {
  id: string;
  app_role?: string | null;
  email?: string | null;
}

/**
 * Business data that leaves in the export. Every entity here has a
 * `tenant_id`; the export always filters by the CALLER's tenant. Deliberately
 * left out: User (other people's PII, the roster lives in Equipo), StaffPin
 * (hashes and salts), StaffInvite and AppSession (delivery / session
 * infrastructure, not the bar's books).
 */
export const EXPORT_ENTITIES = [
  'Category',
  'Product',
  'BarTable',
  'Order',
  'OrderItem',
  'Payment',
  'Shift',
  'CashMovement',
  'InventoryItem',
  'InventoryMovement',
  'Attendance',
  'PrintJob',
  'PermissionProfile',
  'SupportTicket',
] as const;

/** Rows read per entity. Hitting it marks the entity `truncated` in the payload. */
export const EXPORT_ROW_LIMIT = 10000;

/**
 * Decision 2 (José, 2026-09-29): deleting a bar keeps the fiscal and labor
 * records (CFF art. 30, five years). This is the list of what stays; the
 * handler never touches these.
 */
export const RETAINED_ENTITIES = [
  'Order',
  'OrderItem',
  'Payment',
  'Shift',
  'CashMovement',
  'InventoryMovement',
  'Attendance',
] as const;

export function isOwner(bar: { owner_id?: string | null } | null | undefined, userId: string): boolean {
  return !!bar?.owner_id && bar.owner_id === userId;
}

export function countAdmins(members: MemberLike[]): number {
  return members.filter((m) => m.app_role === 'bar_admin').length;
}

/** deleteMyAccount: may the caller remove their own account? null = allowed. */
export function checkDeleteMyAccount(input: {
  members: MemberLike[];
  callerId: string;
  ownerId?: string | null;
  isPlatform: boolean;
}): AccountDenial | null {
  if (input.isPlatform) return 'platform_account';
  if (input.ownerId && input.ownerId === input.callerId) return 'owner_locked';
  const me = input.members.find((m) => m.id === input.callerId);
  if (me?.app_role === 'bar_admin' && countAdmins(input.members) <= 1) return 'last_admin';
  return null;
}

/** delegateBar: owner hands the bar to another bar_admin of the SAME bar. */
export function checkDelegate(input: {
  members: MemberLike[];
  callerId: string;
  ownerId?: string | null;
  targetId: string;
}): AccountDenial | null {
  if (!input.ownerId || input.ownerId !== input.callerId) return 'not_owner';
  if (!input.targetId || input.targetId === input.callerId) return 'self_target';
  const target = input.members.find((m) => m.id === input.targetId);
  if (!target) return 'not_found';
  if (target.app_role !== 'bar_admin') return 'target_not_admin';
  return null;
}

/** deleteBar: owner only. A platform admin without ownership is refused too. */
export function checkDeleteBar(input: { callerId: string; ownerId?: string | null }): AccountDenial | null {
  return input.ownerId && input.ownerId === input.callerId ? null : 'not_owner';
}

/** Case-insensitive, trimmed comparison of the typed confirmation. */
export function confirmationMatches(typed: unknown, expected: unknown): boolean {
  if (typeof typed !== 'string' || typeof expected !== 'string') return false;
  const a = typed.trim().toLowerCase();
  const b = expected.trim().toLowerCase();
  return a.length > 0 && a === b;
}

/**
 * Recount after the write (module 14 pattern from manageStaff): the pre-check
 * reads the team before the write, so two concurrent departures can each pass
 * it. True = the departure left the bar without an admin, so undo it.
 */
export function barLostAllAdmins(membersAfter: MemberLike[], callerWasAdmin: boolean): boolean {
  return callerWasAdmin && countAdmins(membersAfter) === 0;
}

/** Patch archiving the bar. Keeps the first archive date on a retry. */
export function archivePatch(bar: { archived_at?: string | null }, nowIso: string) {
  return { billing_status: 'suspended', archived_at: bar?.archived_at || nowIso };
}

export function isPendingInvite(row: { status?: string | null }): boolean {
  // A row with no status is the schema default: pending.
  return !row.status || row.status === 'pending';
}

export function isOpenAttendance(row: { clock_out?: string | null }): boolean {
  return !row.clock_out;
}

export const ACCOUNT_CLOSE_NOTE = 'Baja de la cuenta';
export const BAR_CLOSE_NOTE = 'Baja del bar';

/** Patch for an Attendance row still open when its person or bar goes away. */
export function closeAttendancePatch(actorEmail: string, nowIso: string, note: string) {
  return { clock_out: nowIso, edited_by: actorEmail, edit_note: note, edited_at: nowIso };
}

/** Entities whose rows carry a cost field (Product also in variants[]). */
export const COST_ENTITIES = ['Product', 'OrderItem', 'InventoryItem', 'InventoryMovement'] as const;

/**
 * Strip every cost from the export tables unless the caller holds
 * `Menú:ver_costos`. Same rule as catalog.listProducts / inventory: cost never
 * leaves the server for someone without that key, export permission or not.
 */
export function redactExportCosts(tables: Record<string, unknown[]>, canSeeCosts: boolean): Record<string, unknown[]> {
  if (canSeeCosts) return tables;
  const out: Record<string, unknown[]> = { ...tables };
  for (const name of COST_ENTITIES) {
    if (!Array.isArray(out[name])) continue;
    out[name] = out[name].map((row: any) => {
      if (row == null || typeof row !== 'object') return row;
      const { cost: _c, unit_cost: _u, variants, ...rest } = row;
      return Array.isArray(variants)
        ? { ...rest, variants: variants.map(({ cost: _vc, ...v }: any) => v) }
        : rest;
    });
  }
  return out;
}

/** The bar row without platform-side records (audit trail, owner pointer). */
export function exportableBar(bar: any): any {
  if (!bar || typeof bar !== 'object') return bar;
  const { license_audit: _a, owner_id: _o, ...rest } = bar;
  return rest;
}

/** The download: one envelope, plain JSON, nothing computed client-side. */
export function buildExportPayload(input: {
  bar: unknown;
  tables: Record<string, unknown[]>;
  errors: Array<{ entity: string; message: string }>;
  truncated: string[];
  nowIso: string;
  costsRedacted?: boolean;
}) {
  const counts: Record<string, number> = {};
  for (const [name, rows] of Object.entries(input.tables)) counts[name] = rows.length;
  return {
    exported_at: input.nowIso,
    bar: input.bar,
    tables: input.tables,
    counts,
    errors: input.errors,
    truncated: input.truncated,
    costs_redacted: !!input.costsRedacted,
  };
}

/**
 * STANDARD section 8: leaving is a ticket too. The record Mission Control
 * pulls so ACACIA knows a bar (or a person) went away. `kind: 'baja'`.
 */
export function buildBajaTicket(input: {
  scope: 'bar' | 'account';
  tenantId: string;
  barName: string;
  actorEmail: string;
  nowIso: string;
}) {
  const bar = input.barName || 'sin nombre';
  const isBar = input.scope === 'bar';
  return {
    tenant_id: input.tenantId,
    kind: 'baja',
    subject: isBar ? `Baja del bar: ${bar}` : `Baja de cuenta en ${bar}`,
    body: isBar
      ? `${input.actorEmail} dio de baja el bar "${bar}" el ${input.nowIso}. El bar quedó archivado y suspendido.`
      : `${input.actorEmail} eliminó su cuenta del bar "${bar}" el ${input.nowIso}.`,
    status: 'abierto',
    created_by_email: input.actorEmail,
  };
}

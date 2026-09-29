// Deno tests for base44/functions/account/handlers/_logic.ts (zero imports).
//   deno test --allow-env base44/tests/account_logic_test.ts
import {
  EXPORT_ENTITIES,
  RETAINED_ENTITIES,
  archivePatch,
  buildBajaTicket,
  barLostAllAdmins,
  buildExportPayload,
  checkDelegate,
  checkDeleteBar,
  checkDeleteMyAccount,
  closeAttendancePatch,
  confirmationMatches,
  countAdmins,
  exportableBar,
  redactExportCosts,
  isPendingInvite,
} from '../functions/account/handlers/_logic.ts';

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(msg || `expected ${e}, got ${a}`);
}

const team = [
  { id: 'o', app_role: 'bar_admin', email: 'o@x.mx' },
  { id: 'a', app_role: 'bar_admin', email: 'a@x.mx' },
  { id: 's', app_role: 'staff', email: 's@x.mx' },
];

Deno.test('deleteMyAccount: the owner is blocked', () => {
  assertEquals(checkDeleteMyAccount({ members: team, callerId: 'o', ownerId: 'o', isPlatform: false }), 'owner_locked');
});

Deno.test('deleteMyAccount: the last admin is blocked, a second admin may leave', () => {
  const solo = [{ id: 'a', app_role: 'bar_admin' }, { id: 's', app_role: 'staff' }];
  assertEquals(checkDeleteMyAccount({ members: solo, callerId: 'a', ownerId: 'zz', isPlatform: false }), 'last_admin');
  assertEquals(checkDeleteMyAccount({ members: team, callerId: 'a', ownerId: 'o', isPlatform: false }), null);
});

Deno.test('deleteMyAccount: staff may leave; platform account never', () => {
  assertEquals(checkDeleteMyAccount({ members: team, callerId: 's', ownerId: 'o', isPlatform: false }), null);
  assertEquals(checkDeleteMyAccount({ members: team, callerId: 's', ownerId: 'o', isPlatform: true }), 'platform_account');
});

Deno.test('delegateBar: only the owner, only to another bar_admin of the same bar', () => {
  const base = { members: team, ownerId: 'o' };
  assertEquals(checkDelegate({ ...base, callerId: 'a', targetId: 'o' }), 'not_owner');
  assertEquals(checkDelegate({ ...base, callerId: 'o', targetId: 'o' }), 'self_target');
  assertEquals(checkDelegate({ ...base, callerId: 'o', targetId: '' }), 'self_target');
  assertEquals(checkDelegate({ ...base, callerId: 'o', targetId: 's' }), 'target_not_admin');
  assertEquals(checkDelegate({ ...base, callerId: 'o', targetId: 'from-another-bar' }), 'not_found');
  assertEquals(checkDelegate({ ...base, callerId: 'o', targetId: 'a' }), null);
});

Deno.test('delegateBar: a bar with no owner_id has nobody who may delegate', () => {
  assertEquals(checkDelegate({ members: team, callerId: 'o', ownerId: null, targetId: 'a' }), 'not_owner');
});

Deno.test('deleteBar: owner only', () => {
  assertEquals(checkDeleteBar({ callerId: 'o', ownerId: 'o' }), null);
  assertEquals(checkDeleteBar({ callerId: 'a', ownerId: 'o' }), 'not_owner');
  assertEquals(checkDeleteBar({ callerId: 'o', ownerId: undefined }), 'not_owner');
});

Deno.test('confirmationMatches: trimmed, case-insensitive, never empty', () => {
  assertEquals(confirmationMatches('  Vino Tinto ', 'vino tinto'), true);
  assertEquals(confirmationMatches('vino', 'vino tinto'), false);
  assertEquals(confirmationMatches('', ''), false);
  assertEquals(confirmationMatches(undefined, 'x'), false);
  assertEquals(confirmationMatches('x', null), false);
});

Deno.test('barLostAllAdmins: only a departing admin can be blamed', () => {
  assertEquals(barLostAllAdmins([{ id: 's', app_role: 'staff' }], true), true);
  assertEquals(barLostAllAdmins([{ id: 's', app_role: 'staff' }], false), false);
  assertEquals(barLostAllAdmins(team, true), false);
  assertEquals(countAdmins(team), 2);
});

Deno.test('archivePatch: suspended + archived_at, first date kept on retry', () => {
  assertEquals(archivePatch({}, '2026-09-29T10:00:00Z'), { billing_status: 'suspended', archived_at: '2026-09-29T10:00:00Z' });
  assertEquals(
    archivePatch({ archived_at: '2026-09-01T00:00:00Z' }, '2026-09-29T10:00:00Z').archived_at,
    '2026-09-01T00:00:00Z',
  );
});

Deno.test('deleteBar keeps the fiscal and labor records and never exports secrets', () => {
  for (const kept of ['Order', 'OrderItem', 'Payment', 'Shift', 'CashMovement', 'InventoryMovement', 'Attendance']) {
    if (!(RETAINED_ENTITIES as readonly string[]).includes(kept)) throw new Error(`${kept} must be retained`);
  }
  for (const secret of ['User', 'StaffPin', 'StaffInvite', 'AppSession']) {
    if ((EXPORT_ENTITIES as readonly string[]).includes(secret)) throw new Error(`${secret} must not be exported`);
  }
  for (const biz of ['Order', 'Payment', 'Product', 'Attendance']) {
    if (!(EXPORT_ENTITIES as readonly string[]).includes(biz)) throw new Error(`${biz} must be exported`);
  }
});

Deno.test('isPendingInvite: missing status counts as pending; accepted and revoked do not', () => {
  assertEquals(isPendingInvite({}), true);
  assertEquals(isPendingInvite({ status: 'pending' }), true);
  assertEquals(isPendingInvite({ status: 'accepted' }), false);
  assertEquals(isPendingInvite({ status: 'revoked' }), false);
});

Deno.test('closeAttendancePatch: closes with the actor and the note', () => {
  assertEquals(closeAttendancePatch('a@x.mx', 'T', 'Baja del bar'), {
    clock_out: 'T', edited_by: 'a@x.mx', edit_note: 'Baja del bar', edited_at: 'T',
  });
});

Deno.test('buildExportPayload: counts per table and carries errors', () => {
  const p = buildExportPayload({
    bar: { id: 'b' },
    tables: { Order: [{}, {}], Payment: [] },
    errors: [{ entity: 'Shift', message: 'x' }],
    truncated: [],
    nowIso: 'T',
  });
  assertEquals(p.counts, { Order: 2, Payment: 0 });
  assertEquals(p.errors.length, 1);
  assertEquals(p.exported_at, 'T');
});

Deno.test('redactExportCosts: strips every cost field without ver_costos', () => {
  const t = {
    Product: [{ id: 'p', cost: 5, price: 9, variants: [{ name: 'v', cost: 3, price: 8 }] }],
    OrderItem: [{ id: 'o', unit_cost: 4, qty: 1 }],
    InventoryItem: [{ id: 'i', unit_cost: 2 }],
    InventoryMovement: [{ id: 'm', unit_cost: 2 }],
    Order: [{ id: 'x', total: 10 }],
  };
  const r = redactExportCosts(t, false);
  const s = JSON.stringify(r);
  assertEquals(s.includes('cost'), false);
  assertEquals((r.Product[0] as any).price, 9);
  assertEquals((r.Product[0] as any).variants[0].price, 8);
  assertEquals(r.Order, t.Order);
});

Deno.test('redactExportCosts: keeps costs with ver_costos', () => {
  const t = { Product: [{ cost: 5 }] };
  assertEquals(redactExportCosts(t, true), t);
});

Deno.test('exportableBar: drops the platform audit trail and owner pointer', () => {
  assertEquals(exportableBar({ id: 'b', name: 'N', license_audit: [1], owner_id: 'u' }), { id: 'b', name: 'N' });
});

Deno.test('buildExportPayload: flags redacted costs', () => {
  const p = buildExportPayload({ bar: {}, tables: {}, errors: [], truncated: [], nowIso: 'T', costsRedacted: true });
  assertEquals(p.costs_redacted, true);
});

Deno.test('buildBajaTicket: a baja ticket carrying tenant, actor and scope', () => {
  const t = buildBajaTicket({ scope: 'bar', tenantId: 't1', barName: 'Vino', actorEmail: 'a@x.mx', nowIso: 'T' });
  assertEquals(t.kind, 'baja');
  assertEquals(t.tenant_id, 't1');
  assertEquals(t.status, 'abierto');
  assertEquals(t.subject, 'Baja del bar: Vino');
  const a = buildBajaTicket({ scope: 'account', tenantId: 't1', barName: 'Vino', actorEmail: 'a@x.mx', nowIso: 'T' });
  assertEquals(a.subject, 'Baja de cuenta en Vino');
});

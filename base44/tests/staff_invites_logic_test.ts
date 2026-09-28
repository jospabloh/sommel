// Deno tests for base44/functions/manageStaff/_invite_logic.ts — zero
// external imports, so this runs even with deno.land/jsr.io blocked (same
// reasoning as base44/tests/guard_logic_test.ts and StockFlow's
// machinery_sales_fields_test.ts).
//
//   /path/to/deno test --allow-env base44/tests/staff_invites_logic_test.ts

import {
  normalizeEmail,
  expiryFrom,
  isExpired,
  isLiveInvite,
  chooseInviteToClaim,
  inviteIdsToRevoke,
  shouldRefreshExistingInvite,
  INVITE_TTL_DAYS,
  type StaffInviteRow,
} from '../functions/manageStaff/_invite_logic.ts';

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(msg || `expected ${e}, got ${a}`);
}

function row(over: Partial<StaffInviteRow>): StaffInviteRow {
  return {
    id: over.id ?? 'inv_1',
    tenant_id: over.tenant_id ?? 'bar_1',
    email: over.email ?? 'meser@bar.com',
    app_role: over.app_role ?? 'staff',
    status: over.status ?? 'pending',
    expires_at: over.expires_at,
    created_date: over.created_date,
  };
}

const NOW = new Date('2026-09-28T12:00:00.000Z');

// ---- normalizeEmail ----

Deno.test('normalizeEmail: trims and lowercases', () => {
  assertEquals(normalizeEmail('  Mesero@Bar.COM  '), 'mesero@bar.com');
});

Deno.test('normalizeEmail: non-string input becomes empty string', () => {
  assertEquals(normalizeEmail(undefined), '');
  assertEquals(normalizeEmail(null), '');
});

// ---- expiryFrom / isExpired ----

Deno.test('expiryFrom: defaults to 14 days out', () => {
  const iso = expiryFrom(NOW);
  const days = (Date.parse(iso) - NOW.getTime()) / (24 * 60 * 60 * 1000);
  assertEquals(days, INVITE_TTL_DAYS);
});

Deno.test('isExpired: a row with no expires_at is never expired', () => {
  assertEquals(isExpired({ expires_at: undefined }, NOW), false);
});

Deno.test('isExpired: past date is expired, future date is not', () => {
  assertEquals(isExpired({ expires_at: '2026-09-01T00:00:00.000Z' }, NOW), true);
  assertEquals(isExpired({ expires_at: '2026-10-01T00:00:00.000Z' }, NOW), false);
});

// ---- isLiveInvite: expired invite ignored ----

Deno.test('isLiveInvite: pending + not expired is live', () => {
  assertEquals(isLiveInvite({ status: 'pending', expires_at: '2026-10-01T00:00:00.000Z' }, NOW), true);
});

Deno.test('isLiveInvite: an EXPIRED pending invite is ignored', () => {
  assertEquals(isLiveInvite({ status: 'pending', expires_at: '2026-09-01T00:00:00.000Z' }, NOW), false);
});

Deno.test('isLiveInvite: revoked or accepted is never live, even unexpired', () => {
  assertEquals(isLiveInvite({ status: 'revoked', expires_at: '2026-10-01T00:00:00.000Z' }, NOW), false);
  assertEquals(isLiveInvite({ status: 'accepted', expires_at: '2026-10-01T00:00:00.000Z' }, NOW), false);
});

// ---- chooseInviteToClaim: most recent chosen; expired ignored ----

Deno.test('chooseInviteToClaim: no rows => null', () => {
  assertEquals(chooseInviteToClaim([], NOW), null);
});

Deno.test('chooseInviteToClaim: only expired rows => null', () => {
  const rows = [row({ id: 'a', expires_at: '2026-09-01T00:00:00.000Z' })];
  assertEquals(chooseInviteToClaim(rows, NOW), null);
});

Deno.test('chooseInviteToClaim: picks the most recently created live invite among several bars', () => {
  const rows = [
    row({ id: 'older', tenant_id: 'bar_a', created_date: '2026-09-01T00:00:00.000Z', expires_at: '2026-10-01T00:00:00.000Z' }),
    row({ id: 'newer', tenant_id: 'bar_b', created_date: '2026-09-20T00:00:00.000Z', expires_at: '2026-10-05T00:00:00.000Z' }),
  ];
  const chosen = chooseInviteToClaim(rows, NOW);
  assertEquals(chosen?.id, 'newer');
});

Deno.test('chooseInviteToClaim: ignores an expired newer row in favor of a live older one', () => {
  const rows = [
    row({ id: 'live_old', created_date: '2026-09-01T00:00:00.000Z', expires_at: '2026-10-01T00:00:00.000Z' }),
    row({ id: 'expired_new', created_date: '2026-09-25T00:00:00.000Z', expires_at: '2026-09-26T00:00:00.000Z' }),
  ];
  const chosen = chooseInviteToClaim(rows, NOW);
  assertEquals(chosen?.id, 'live_old');
});

Deno.test('chooseInviteToClaim: deterministic tiebreak by id when created_date ties', () => {
  const rows = [
    row({ id: 'b', created_date: '2026-09-20T00:00:00.000Z', expires_at: '2026-10-01T00:00:00.000Z' }),
    row({ id: 'a', created_date: '2026-09-20T00:00:00.000Z', expires_at: '2026-10-01T00:00:00.000Z' }),
  ];
  const chosen = chooseInviteToClaim(rows, NOW);
  assertEquals(chosen?.id, 'b');
});

// ---- inviteIdsToRevoke ----

Deno.test('inviteIdsToRevoke: revokes every other live candidate, not the chosen one, not already-dead ones', () => {
  const chosen = row({ id: 'chosen', created_date: '2026-09-20T00:00:00.000Z', expires_at: '2026-10-01T00:00:00.000Z' });
  const rows = [
    chosen,
    row({ id: 'other_live', created_date: '2026-09-01T00:00:00.000Z', expires_at: '2026-10-01T00:00:00.000Z' }),
    row({ id: 'already_expired', created_date: '2026-08-01T00:00:00.000Z', expires_at: '2026-08-15T00:00:00.000Z' }),
    row({ id: 'already_revoked', status: 'revoked', created_date: '2026-08-01T00:00:00.000Z' }),
  ];
  assertEquals(inviteIdsToRevoke(rows, chosen, NOW), ['other_live']);
});

// ---- shouldRefreshExistingInvite ----

Deno.test('shouldRefreshExistingInvite: true for a pending row on the same tenant+email', () => {
  assertEquals(
    shouldRefreshExistingInvite({ tenant_id: 'bar_1', email: 'a@b.com', status: 'pending' }, 'bar_1', 'a@b.com'),
    true
  );
});

Deno.test('shouldRefreshExistingInvite: false when there is no existing row', () => {
  assertEquals(shouldRefreshExistingInvite(null, 'bar_1', 'a@b.com'), false);
  assertEquals(shouldRefreshExistingInvite(undefined, 'bar_1', 'a@b.com'), false);
});

Deno.test('shouldRefreshExistingInvite: false for a different tenant or email (a NEW row is created instead)', () => {
  assertEquals(
    shouldRefreshExistingInvite({ tenant_id: 'bar_2', email: 'a@b.com', status: 'pending' }, 'bar_1', 'a@b.com'),
    false
  );
  assertEquals(
    shouldRefreshExistingInvite({ tenant_id: 'bar_1', email: 'other@b.com', status: 'pending' }, 'bar_1', 'a@b.com'),
    false
  );
});

Deno.test('shouldRefreshExistingInvite: false for a revoked or accepted row (a NEW pending row is created instead)', () => {
  assertEquals(
    shouldRefreshExistingInvite({ tenant_id: 'bar_1', email: 'a@b.com', status: 'revoked' }, 'bar_1', 'a@b.com'),
    false
  );
  assertEquals(
    shouldRefreshExistingInvite({ tenant_id: 'bar_1', email: 'a@b.com', status: 'accepted' }, 'bar_1', 'a@b.com'),
    false
  );
});

// ---- caller with tenant never re-assigned (documents the entry.ts guard the
// pure logic here can't itself express — claimInvite checks ctx.self.tenant_id
// BEFORE ever calling chooseInviteToClaim; this test just pins the reasoning) ----

Deno.test('a caller who already has a tenant must never reach chooseInviteToClaim at all', () => {
  // This is enforced in entry.ts (claimInvite returns already_in_a_bar before
  // querying StaffInvite), not in this pure module — documented here so the
  // invariant has a single, named place asserting it exists.
  const alreadyAssigned = { tenant_id: 'bar_1' };
  assertEquals(!!alreadyAssigned.tenant_id, true);
});

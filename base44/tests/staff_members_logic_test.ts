// deno test --allow-env base44/tests/staff_members_logic_test.ts
import {
  checkRemoveMember,
  checkSetRole,
  closeOpenAttendancePatch,
  countAdmins,
  isMemberRole,
  isOpenAttendance,
  isOwner,
} from '../functions/manageStaff/_member_logic.ts';

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(msg || `expected ${e}, got ${a}`);
}

const team = [
  { id: 'o', app_role: 'bar_admin' },
  { id: 'a2', app_role: 'bar_admin' },
  { id: 's1', app_role: 'staff' },
];
const solo = [{ id: 'o', app_role: 'bar_admin' }, { id: 's1', app_role: 'staff' }];

Deno.test('isMemberRole only accepts the two roles', () => {
  assertEquals(isMemberRole('staff'), true);
  assertEquals(isMemberRole('bar_admin'), true);
  assertEquals(isMemberRole('admin'), false);
  assertEquals(isMemberRole(undefined), false);
});

Deno.test('isOwner', () => {
  assertEquals(isOwner({ owner_id: 'o' }, 'o'), true);
  assertEquals(isOwner({ owner_id: 'o' }, 'x'), false);
  assertEquals(isOwner({}, 'o'), false);
  assertEquals(isOwner(null, 'o'), false);
});

Deno.test('countAdmins', () => {
  assertEquals(countAdmins(team), 2);
  assertEquals(countAdmins([]), 0);
});

Deno.test('setRole: promote staff', () => {
  assertEquals(checkSetRole({ members: team, targetId: 's1', newRole: 'bar_admin', ownerId: 'o' }), null);
});
Deno.test('setRole: demote a non-last admin', () => {
  assertEquals(checkSetRole({ members: team, targetId: 'a2', newRole: 'staff', ownerId: 'o' }), null);
});
Deno.test('setRole: target outside bar is not_found', () => {
  assertEquals(checkSetRole({ members: team, targetId: 'zzz', newRole: 'staff' }), 'not_found');
});
Deno.test('setRole: owner is locked, both directions', () => {
  assertEquals(checkSetRole({ members: team, targetId: 'o', newRole: 'staff', ownerId: 'o' }), 'owner_locked');
  assertEquals(checkSetRole({ members: team, targetId: 'o', newRole: 'bar_admin', ownerId: 'o' }), 'owner_locked');
});
Deno.test('setRole: last admin cannot be demoted', () => {
  assertEquals(checkSetRole({ members: solo, targetId: 'o', newRole: 'staff' }), 'last_admin');
});
Deno.test('setRole: same role on staff is harmless', () => {
  assertEquals(checkSetRole({ members: solo, targetId: 's1', newRole: 'staff', ownerId: 'o' }), null);
});
Deno.test('setRole: owner_locked wins over last_admin', () => {
  assertEquals(checkSetRole({ members: solo, targetId: 'o', newRole: 'staff', ownerId: 'o' }), 'owner_locked');
});

Deno.test('remove: staff member ok', () => {
  assertEquals(checkRemoveMember({ members: team, targetId: 's1', callerId: 'o', ownerId: 'o' }), null);
});
Deno.test('remove: outside bar is not_found', () => {
  assertEquals(checkRemoveMember({ members: team, targetId: 'q', callerId: 'o' }), 'not_found');
});
Deno.test('remove: owner locked', () => {
  assertEquals(checkRemoveMember({ members: team, targetId: 'o', callerId: 'a2', ownerId: 'o' }), 'owner_locked');
});
Deno.test('remove: cannot remove yourself', () => {
  assertEquals(checkRemoveMember({ members: team, targetId: 'a2', callerId: 'a2', ownerId: 'o' }), 'self_remove');
});
Deno.test('remove: a non-last admin can be removed by another admin', () => {
  assertEquals(checkRemoveMember({ members: team, targetId: 'a2', callerId: 'o', ownerId: 'o' }), null);
});
Deno.test('remove: last admin blocked (platform caller)', () => {
  assertEquals(checkRemoveMember({ members: solo, targetId: 'o', callerId: 'platform' }), 'last_admin');
});

Deno.test('closeOpenAttendancePatch carries the contract fields', () => {
  const p = closeOpenAttendancePatch('a@b.com', '2026-09-29T20:00:00.000Z');
  assertEquals(p, {
    clock_out: '2026-09-29T20:00:00.000Z',
    edited_by: 'a@b.com',
    edit_note: 'Baja del equipo',
    edited_at: '2026-09-29T20:00:00.000Z',
  });
});
Deno.test('isOpenAttendance', () => {
  assertEquals(isOpenAttendance({ clock_out: null }), true);
  assertEquals(isOpenAttendance({}), true);
  assertEquals(isOpenAttendance({ clock_out: '2026-09-29T20:00:00Z' }), false);
});

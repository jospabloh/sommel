// Pure rules for manageStaff.setRole / removeMember (contract §4). ZERO
// imports on purpose, so `deno test` runs it in a sandbox without deno.land.

export type MemberRole = 'staff' | 'bar_admin';

export interface MemberLike {
  id: string;
  app_role?: string | null;
}

export type MemberDenial = 'not_found' | 'owner_locked' | 'last_admin' | 'self_remove';

export const MEMBER_DENIAL_STATUS: Record<MemberDenial, number> = {
  not_found: 404,
  owner_locked: 409,
  last_admin: 409,
  self_remove: 409,
};

export const MEMBER_DENIAL_MESSAGE: Record<MemberDenial, string> = {
  not_found: 'No encontrado',
  owner_locked: 'El dueño del bar no se puede modificar',
  last_admin: 'El bar no puede quedarse sin administrador',
  self_remove: 'No puedes quitarte a ti mismo del equipo',
};

export function isMemberRole(value: unknown): value is MemberRole {
  return value === 'staff' || value === 'bar_admin';
}

/** True when `userId` is the bar owner (WineBar.owner_id). */
export function isOwner(bar: { owner_id?: string | null } | null | undefined, userId: string): boolean {
  return !!bar?.owner_id && bar.owner_id === userId;
}

/** Number of members of the bar (already filtered by tenant) that are bar_admin. */
export function countAdmins(members: MemberLike[]): number {
  return members.filter((m) => m.app_role === 'bar_admin').length;
}

/**
 * Decides whether the caller may change `target`'s role to `newRole`.
 * `members` = every User of the caller's bar. Returns null when allowed.
 * A target outside the bar is reported as not_found (never leak other bars).
 */
export function checkSetRole(input: {
  members: MemberLike[];
  targetId: string;
  newRole: MemberRole;
  ownerId?: string | null;
}): MemberDenial | null {
  const target = input.members.find((m) => m.id === input.targetId);
  if (!target) return 'not_found';
  if (input.ownerId && input.ownerId === target.id) return 'owner_locked';
  const demoting = target.app_role === 'bar_admin' && input.newRole !== 'bar_admin';
  if (demoting && countAdmins(input.members) <= 1) return 'last_admin';
  return null;
}

/** Same for removal. `callerId` blocks removing yourself. */
export function checkRemoveMember(input: {
  members: MemberLike[];
  targetId: string;
  callerId: string;
  ownerId?: string | null;
}): MemberDenial | null {
  const target = input.members.find((m) => m.id === input.targetId);
  if (!target) return 'not_found';
  if (input.ownerId && input.ownerId === target.id) return 'owner_locked';
  if (input.targetId === input.callerId) return 'self_remove';
  if (target.app_role === 'bar_admin' && countAdmins(input.members) <= 1) return 'last_admin';
  return null;
}

export const REMOVAL_EDIT_NOTE = 'Baja del equipo';

/** Patch applied to an Attendance row still open when its member is removed. */
export function closeOpenAttendancePatch(callerEmail: string, nowIso: string) {
  return { clock_out: nowIso, edited_by: callerEmail, edit_note: REMOVAL_EDIT_NOTE, edited_at: nowIso };
}

/** Rows without clock_out are still open. */
export function isOpenAttendance(row: { clock_out?: string | null }): boolean {
  return !row.clock_out;
}

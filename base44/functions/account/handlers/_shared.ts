// Service-role helpers shared by the account handlers.
import type { Ctx } from '../_guard.ts';

/**
 * Cuts a person's access to their bar and confirms it. Fail closed: Base44 may
 * silently drop a null on a string field, so re-read and, if the pointer is
 * still there, retry with '' (every check treats an empty tenant_id as "no
 * bar"). Same pattern as manageStaff.removeMember. Returns false when access
 * could not be cut.
 */
export async function unlinkUser(svc: Ctx['svc'], userId: string): Promise<boolean> {
  const gone = async () => {
    const [after] = await svc.entities.User.filter({ id: userId });
    return !after?.tenant_id;
  };
  await svc.entities.User.update(userId, { tenant_id: null, app_role: null });
  if (await gone()) return true;
  await svc.entities.User.update(userId, { tenant_id: '', app_role: '' });
  return await gone();
}

/** Undoes `unlinkUser` when a recount says the departure left no admin. */
export async function relinkUser(svc: Ctx['svc'], userId: string, tenantId: string, appRole: string | null) {
  await svc.entities.User.update(userId, { tenant_id: tenantId, app_role: appRole ?? 'staff' });
}

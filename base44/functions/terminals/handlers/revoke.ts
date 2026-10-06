// terminals.revoke: the device stops working on its next call (the guard
// checks revoked_at), and its Base44 account is removed.
import { loadOwned, type Ctx, type Route } from '../_guard.ts';
import { publicDevice } from '../_terminal_logic.ts';
import { deprovisionAccount } from '../_platform.ts';
import { requireBarAdmin } from './_shared.ts';

export const revoke: Route = async (ctx: Ctx, body: any) => {
  requireBarAdmin(ctx);
  const device = await loadOwned(ctx, 'TerminalDevice', typeof body?.device_id === 'string' ? body.device_id : '');
  // No billing gate: a suspended bar must still be able to cut a device off.
  let row = device;
  if (!device.revoked_at) {
    row = await ctx.svc.entities.TerminalDevice.update(device.id, {
      revoked_at: new Date().toISOString(),
      revoked_by_user_id: ctx.self.id,
    });
  }
  // Delete the account first; then unlink it from the bar either way. It keeps
  // app_role 'terminal' on purpose: with no bar it cannot create one
  // (createWineBar refuses terminals) and the guard already answers revoked.
  const deprovisioned = device.account_email ? await deprovisionAccount(device.account_email) : false;
  if (deprovisioned && !device.account_deleted_at) {
    row = await ctx.svc.entities.TerminalDevice.update(device.id, { account_deleted_at: new Date().toISOString() });
  }
  try {
    await ctx.svc.entities.User.update(device.account_user_id, { tenant_id: null });
    const [after] = await ctx.svc.entities.User.filter({ id: device.account_user_id });
    if (after?.tenant_id) await ctx.svc.entities.User.update(device.account_user_id, { tenant_id: '' });
  } catch {
    // already gone with the deprovision
  }
  return { device: publicDevice(row ?? device), deprovisioned };
};

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
  // Belt and braces: unlink the account from the bar, then delete it.
  try {
    await ctx.svc.entities.User.update(device.account_user_id, { tenant_id: '', app_role: '' });
  } catch {
    // already gone
  }
  const deprovisioned = device.account_email ? await deprovisionAccount(device.account_email) : false;
  return { device: publicDevice(row ?? device), deprovisioned };
};

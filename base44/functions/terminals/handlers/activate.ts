// terminals.activate: turns the admin's current device into a terminal.
// Creates a Base44 account with no mailbox for it, signs it in server side,
// points it at this bar with app_role 'terminal' (no permissions of its own),
// and returns that session to the browser, which switches to it.
import { randomHex, requireWritable, type Ctx, type Route } from '../_guard.ts';
import { normalizeAllowed, publicDevice, terminalEmail, validateTerminalName, displayName } from '../_terminal_logic.ts';
import { deprovisionAccount, provisionAccount, signInAs, userIdOf } from '../_platform.ts';
import { barPeople, mapErrors, requireBarAdmin } from './_shared.ts';

export const activate: Route = async (ctx: Ctx, body: any) => {
  const tenantId = requireBarAdmin(ctx);
  requireWritable(ctx);
  const name = await mapErrors(() => validateTerminalName(body?.name));
  const members = await barPeople(ctx, tenantId);
  const allowed = await mapErrors(() => normalizeAllowed(body?.allowed, new Set(members.map((m) => m.id))));

  const email = terminalEmail(randomHex(6));
  const fullName = `Terminal ${name}`;
  let provisioned = false;
  try {
    const status = await mapErrors(() => provisionAccount(email, fullName));
    provisioned = true;
    if (status !== 'created') throw new Error(`unexpected provision status ${status}`);
    const session = await mapErrors(() => signInAs(email));
    const accountUserId = await mapErrors(() => userIdOf(session));

    await ctx.svc.entities.User.update(accountUserId, { tenant_id: tenantId, app_role: 'terminal', full_name: fullName });
    const [account] = await ctx.svc.entities.User.filter({ id: accountUserId });
    if (account?.tenant_id !== tenantId || account?.app_role !== 'terminal') {
      throw new Error('terminal account did not take the bar');
    }

    const device = await ctx.svc.entities.TerminalDevice.create({
      tenant_id: tenantId,
      name,
      account_user_id: accountUserId,
      account_email: email,
      pass_key: randomHex(32),
      allowed,
      activated_by_user_id: ctx.self.id,
      activated_by_name: displayName(ctx.self),
      last_seen_at: new Date().toISOString(),
      revoked_at: null,
    });
    return { device: publicDevice(device), session };
  } catch (err) {
    // Never leave a half-made terminal account behind.
    if (provisioned) await deprovisionAccount(email);
    throw err;
  }
};

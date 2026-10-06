// terminals.addPerson / setPersonPin (phase 2b, 2026-10-06): people WITHOUT
// email. The bar admin adds them from Staff; Sommel creates an account with no
// mailbox (nobody can sign in with it) and the person types their own PIN on
// the admin's screen. From then on they unlock terminals like anyone else.
// Only the admin, from their own sign-in (remoteOnly in entry.ts).
import { httpError, randomHex, requireWritable, type Ctx, type Route } from '../_guard.ts';
import { hashPin } from '../_pin.ts';
import { isInternalPersonEmail, personEmail, validateNewPin, validatePersonName, validatePersonRole } from '../_terminal_logic.ts';
import { deprovisionAccount, provisionAccount, signInAs, userIdOf } from '../_platform.ts';
import { mapErrors, requireBarAdmin } from './_shared.ts';

async function writePin(ctx: Ctx, tenantId: string, userId: string, pin: string): Promise<void> {
  const { salt, pin_hash } = await hashPin(pin);
  const fields = { salt, pin_hash, failed_attempts: 0, locked_until: null };
  const rows = await ctx.svc.entities.StaffPin.filter({ tenant_id: tenantId, user_id: userId });
  if (rows[0]) {
    await ctx.svc.entities.StaffPin.update(rows[0].id, fields);
    for (const extra of rows.slice(1)) await ctx.svc.entities.StaffPin.delete(extra.id);
  } else {
    await ctx.svc.entities.StaffPin.create({ tenant_id: tenantId, user_id: userId, ...fields });
  }
}

export const addPerson: Route = async (ctx: Ctx, body: any) => {
  const tenantId = requireBarAdmin(ctx);
  requireWritable(ctx);
  const name = await mapErrors(() => validatePersonName(body?.name));
  const role = await mapErrors(() => validatePersonRole(body?.app_role));
  const pin = await mapErrors(() => validateNewPin(body?.pin));

  const email = personEmail(randomHex(6));
  let provisioned = false;
  try {
    const status = await mapErrors(() => provisionAccount(email, name));
    provisioned = true;
    if (status !== 'created') throw new Error(`unexpected provision status ${status}`);
    // Signing in once is how Base44 creates the app's User row; the session is
    // dropped right here and never reaches anyone.
    const session = await mapErrors(() => signInAs(email));
    const userId = await mapErrors(() => userIdOf(session));

    await ctx.svc.entities.User.update(userId, { tenant_id: tenantId, app_role: role, display_name: name, full_name: name });
    const [row] = await ctx.svc.entities.User.filter({ id: userId });
    if (row?.tenant_id !== tenantId || row?.app_role !== role) throw new Error('person account did not take the bar');
    await writePin(ctx, tenantId, userId, pin);
    return { person: { id: userId, name, app_role: role } };
  } catch (err) {
    // Never leave a half-made account behind.
    if (provisioned) await deprovisionAccount(email);
    throw err;
  }
};

export const setPersonPin: Route = async (ctx: Ctx, body: any) => {
  const tenantId = requireBarAdmin(ctx);
  requireWritable(ctx);
  const pin = await mapErrors(() => validateNewPin(body?.pin));
  const id = typeof body?.user_id === 'string' && body.user_id.length <= 64 ? body.user_id : '';
  const [target] = id ? await ctx.svc.entities.User.filter({ id }) : [];
  if (!target || target.tenant_id !== tenantId || (target.app_role !== 'staff' && target.app_role !== 'bar_admin')) {
    httpError(404, 'not_found', 'No se encontró a esa persona en tu bar');
  }
  // Someone with their own email sets their own PIN; the admin never learns it.
  if (!isInternalPersonEmail(target.email)) {
    httpError(400, 'has_own_login', 'Esta persona tiene correo: ella pone su propio PIN en el checador');
  }
  await writePin(ctx, tenantId, target.id, pin);
  return { ok: true };
};

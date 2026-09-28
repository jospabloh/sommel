import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import {
  normalizeEmail,
  expiryFrom,
  chooseInviteToClaim,
  inviteIdsToRevoke,
  shouldRefreshExistingInvite,
} from './_invite_logic.ts';

// Standalone function (does not use _guard.ts — contrato §5, manageStaff is
// owned by "Base" and kept self-contained on purpose).
//
// Fix 2026-09-28 (verified live): manageStaff.invite only assigned
// tenant_id/app_role when the invited User ALREADY existed. Someone with no
// account got Base44's invite email, registered, and landed on /onboarding
// with no bar — the server had nowhere to remember "this email belongs to
// this bar" until the account already existed. StaffInvite is that memory: a
// pending row per (tenant, email), claimed by claimInvite once that email
// finally logs in (see Onboarding.jsx).
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    // auth.me() throws (not null) without a session; answer 401, not 500.
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Inicia sesión para continuar', code: 'unauthenticated' }, { status: 401 });
    const svc = base44.asServiceRole;

    const body = await req.json();
    const action = body.action;

    // Re-read the stored profile: auth.me()'s own copy can be stale — the
    // SDK returns User rows flat, so these read self.tenant_id/self.app_role
    // directly, never self.data.tenant_id/self.data.app_role.
    const [self] = await svc.entities.User.filter({ id: user.id });
    if (!self) return Response.json({ error: 'Usuario no encontrado', code: 'unauthenticated' }, { status: 401 });
    const tenantId = self.tenant_id;
    const appRole = self.app_role;
    const isPlatformAdmin = self.role === 'admin';

    // claimInvite runs BEFORE the bar_admin gate below: it's the one action
    // any authenticated person can call, regardless of tenant/role — it's
    // how they GET a tenant in the first place.
    if (action === 'claimInvite') {
      return await claimInvite(svc, self);
    }

    if (!tenantId || (appRole !== 'bar_admin' && !isPlatformAdmin)) {
      return Response.json({ error: 'Solo el administrador del bar puede gestionar staff' }, { status: 403 });
    }

    if (action === 'list') {
      const users = await svc.entities.User.filter({ tenant_id: tenantId });
      const inviteRows = await svc.entities.StaffInvite.filter({ tenant_id: tenantId, status: 'pending' });
      const now = new Date();
      const invites = inviteRows
        .filter((inv: any) => !inv.expires_at || Date.parse(inv.expires_at) > now.getTime())
        .map((inv: any) => ({
          id: inv.id, email: inv.email, app_role: inv.app_role, expires_at: inv.expires_at, invited_by: inv.invited_by
        }));
      return Response.json({
        staff: users.map((u: any) => ({
          id: u.id, email: u.email, full_name: u.full_name, app_role: u.app_role
        })),
        invites
      });
    }

    if (action === 'invite') {
      // Fixed 2026-09-28: this write had no billing gate — a suspended or
      // view_only bar could still add staff, unlike every other write in
      // this app (requireWritable). Platform callers have no bar of their
      // own to gate against (same allowance _guard.ts's requireWritable
      // gives an unloaded `bar`).
      if (!isPlatformAdmin) {
        const [barRow] = await svc.entities.WineBar.filter({ id: tenantId });
        const billingStatus = barRow?.billing_status;
        if (billingStatus === 'view_only' || billingStatus === 'suspended') {
          return Response.json(
            { error: 'El bar está en modo solo lectura o suspendido', code: 'read_only' },
            { status: 402 }
          );
        }
      }

      const email = normalizeEmail(body.email);
      if (!email) return Response.json({ error: 'Email requerido' }, { status: 400 });

      // Role param optional (staff default); bar_admin is only honored for a
      // caller who is already bar_admin of this bar — the gate above already
      // guarantees that for every caller reaching this line (isPlatformAdmin
      // has no bar_admin identity to hand out, so it also falls to 'staff').
      const requestedRole = body.app_role === 'bar_admin' && appRole === 'bar_admin' ? 'bar_admin' : 'staff';

      // Never pull someone out of another bar: that would move their access
      // into this one. Checked before inviting, so a refusal sends nothing.
      const [existing] = await svc.entities.User.filter({ email });
      if (existing?.tenant_id && existing.tenant_id !== tenantId) {
        return Response.json({ error: 'Ese usuario ya pertenece a otro bar', code: 'already_in_a_bar' }, { status: 409 });
      }
      try {
        await base44.users.inviteUser(email, 'user');
      } catch (e) {
        return Response.json({ error: 'No se pudo invitar: ' + (e as Error).message }, { status: 400 });
      }
      // Re-check right before writing: the user may have joined another bar
      // while the invite was in flight. Only an unassigned user is claimed.
      // (Base44 has no conditional update, so a sub-second race remains.)
      const [target] = await svc.entities.User.filter({ email });
      if (target?.tenant_id && target.tenant_id !== tenantId) {
        return Response.json({ error: 'Ese usuario ya pertenece a otro bar', code: 'already_in_a_bar' }, { status: 409 });
      }
      if (target && !target.tenant_id) {
        await svc.entities.User.update(target.id, {
          tenant_id: tenantId, app_role: requestedRole
        });
        return Response.json({ ok: true, invited_existing: true });
      }

      // No account yet: remember the invite server-side so claimInvite can
      // finish the job once that email logs in for the first time. One
      // pending row per tenant+email — refresh instead of duplicating.
      const [existingInvite] = await svc.entities.StaffInvite.filter({ tenant_id: tenantId, email });
      const now = new Date();
      const expiresAt = expiryFrom(now);
      if (shouldRefreshExistingInvite(existingInvite, tenantId, email)) {
        await svc.entities.StaffInvite.update(existingInvite.id, {
          expires_at: expiresAt, app_role: requestedRole, invited_by: self.email
        });
      } else {
        await svc.entities.StaffInvite.create({
          tenant_id: tenantId, email, app_role: requestedRole, status: 'pending',
          invited_by: self.email, expires_at: expiresAt
        });
      }
      return Response.json({ ok: true, invited_existing: false });
    }

    if (action === 'revokeInvite') {
      const inviteId = body.invite_id;
      if (!inviteId) return Response.json({ error: 'invite_id requerido' }, { status: 400 });
      // Not found or another tenant's row both answer 404 — telling them
      // apart would leak which invite ids exist in other bars (same
      // rationale as _guard.ts's loadOwned).
      const [invite] = await svc.entities.StaffInvite.filter({ id: inviteId });
      if (!invite || invite.tenant_id !== tenantId) {
        return Response.json({ error: 'No encontrado', code: 'not_found' }, { status: 404 });
      }
      await svc.entities.StaffInvite.update(invite.id, { status: 'revoked' });
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Acción no válida' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}

/**
 * Any authenticated user may call this — it's how they GET a tenant. Always
 * re-reads `self` (already done by the caller with asServiceRole, module 22)
 * and only ever looks up StaffInvite rows by the caller's STORED email,
 * never anything from the request body — a forged `email` in the body can
 * never claim someone else's invite.
 */
async function claimInvite(svc: any, self: any): Promise<Response> {
  if (self.tenant_id) {
    return Response.json({ ok: true, claimed: false, reason: 'already_in_a_bar' });
  }
  const email = normalizeEmail(self.email);
  if (!email) return Response.json({ ok: true, claimed: false });

  const candidates = await svc.entities.StaffInvite.filter({ email });
  const now = new Date();
  const chosen = chooseInviteToClaim(candidates, now);
  if (!chosen) return Response.json({ ok: true, claimed: false });

  // Revoke every other live candidate (other bars' pending invites to the
  // same email) so this person doesn't keep a claimable invite to a second
  // bar after joining the first one.
  const toRevoke = inviteIdsToRevoke(candidates, chosen, now);
  for (const id of toRevoke) {
    await svc.entities.StaffInvite.update(id, { status: 'revoked' });
  }

  await svc.entities.User.update(self.id, {
    tenant_id: chosen.tenant_id, app_role: chosen.app_role || 'staff'
  });
  await svc.entities.StaffInvite.update(chosen.id, {
    status: 'accepted', accepted_at: now.toISOString(), accepted_user_id: self.id
  });

  let barName: string | undefined;
  try {
    const [bar] = await svc.entities.WineBar.filter({ id: chosen.tenant_id });
    barName = bar?.name;
  } catch {
    // Best-effort only: the claim itself already succeeded above.
  }

  return Response.json({ ok: true, claimed: true, tenant_id: chosen.tenant_id, bar_name: barName });
}

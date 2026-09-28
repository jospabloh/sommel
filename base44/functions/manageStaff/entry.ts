import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    // Re-read the stored profile: auth.me()'s .data is not what RLS reads.
    const [self] = await base44.asServiceRole.entities.User.filter({ id: user.id });
    const tenantId = self?.data?.tenant_id;
    const appRole = self?.data?.app_role;
    // Fixed 2026-09-28: derive from the re-read `self` row, not `user`
    // (auth.me()'s own payload) — same fix as _guard.ts's requireContext,
    // and for the same reason (module 22: never trust auth.me() for an
    // access decision).
    const isPlatformAdmin = self?.role === 'admin';
    if (!tenantId || (appRole !== 'bar_admin' && !isPlatformAdmin)) {
      return Response.json({ error: 'Solo el administrador del bar puede gestionar staff' }, { status: 403 });
    }

    const body = await req.json();
    const action = body.action;

    if (action === 'list') {
      const users = await base44.asServiceRole.entities.User.filter({ tenant_id: tenantId });
      return Response.json({
        staff: users.map((u: any) => ({
          id: u.id, email: u.email, full_name: u.full_name, app_role: u.data?.app_role
        }))
      });
    }

    if (action === 'invite') {
      // Fixed 2026-09-28: this write had no billing gate — a suspended or
      // view_only bar could still add staff, unlike every other write in
      // this app (requireWritable). Platform callers have no bar of their
      // own to gate against (same allowance _guard.ts's requireWritable
      // gives an unloaded `bar`).
      if (!isPlatformAdmin) {
        const [barRow] = await base44.asServiceRole.entities.WineBar.filter({ id: tenantId });
        const billingStatus = barRow?.data?.billing_status;
        if (billingStatus === 'view_only' || billingStatus === 'suspended') {
          return Response.json(
            { error: 'El bar está en modo solo lectura o suspendido', code: 'read_only' },
            { status: 402 }
          );
        }
      }

      const email = (body.email || '').toString().trim();
      if (!email) return Response.json({ error: 'Email requerido' }, { status: 400 });
      // Never pull someone out of another bar: that would move their access
      // into this one. Checked before inviting, so a refusal sends nothing.
      const [existing] = await base44.asServiceRole.entities.User.filter({ email });
      if (existing?.data?.tenant_id && existing.data.tenant_id !== tenantId) {
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
      const [target] = await base44.asServiceRole.entities.User.filter({ email });
      if (target?.data?.tenant_id && target.data.tenant_id !== tenantId) {
        return Response.json({ error: 'Ese usuario ya pertenece a otro bar', code: 'already_in_a_bar' }, { status: 409 });
      }
      if (target && !target.data?.tenant_id) {
        await base44.asServiceRole.entities.User.update(target.id, {
          data: { ...(target.data ?? {}), tenant_id: tenantId, app_role: 'staff' }
        });
      }
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Acción no válida' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
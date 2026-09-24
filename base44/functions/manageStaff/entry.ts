import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const tenantId = user.data?.tenant_id;
    const appRole = user.data?.app_role;
    const isPlatformAdmin = user.role === 'admin';
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
      const email = (body.email || '').toString().trim();
      if (!email) return Response.json({ error: 'Email requerido' }, { status: 400 });
      // Check the target BEFORE inviting: an existing user who already belongs
      // to a bar must never be re-pointed or re-roled by another bar's admin.
      const existing = await base44.asServiceRole.entities.User.filter({ email });
      const current = existing[0];
      const currentTenant = current?.data?.tenant_id;
      if (currentTenant && currentTenant !== tenantId) {
        return Response.json({ error: 'Este email ya está vinculado a otro bar' }, { status: 409 });
      }
      if (currentTenant === tenantId) {
        return Response.json({ ok: true, already_member: true });
      }
      try {
        await base44.users.inviteUser(email, 'user');
      } catch (e) {
        return Response.json({ error: 'No se pudo invitar: ' + e.message }, { status: 400 });
      }
      const matches = await base44.asServiceRole.entities.User.filter({ email });
      const target = matches[0];
      // Re-check after the invite: only a user with no bar may be assigned.
      if (target && !target.data?.tenant_id) {
        await base44.asServiceRole.entities.User.update(target.id, {
          data: { tenant_id: tenantId, app_role: 'staff' }
        });
      }
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Acción no válida' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
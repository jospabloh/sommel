import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

// The only way a user gets a tenant: User.tenant_id/app_role are rls.write:false
// (Module 24 of jospabloh/acacia-app-standard), so onboarding can no longer set
// them from the browser with updateMe — which also let anyone point themselves
// at another bar's tenant_id and read its data.
//
// No default menu/table seeding here on purpose (plan-tecnico.md §0/§4):
// Vindima's menu is loaded from her own Excel, not a generic wine-bar
// placeholder catalog — a prior version of this function seeded
// DEFAULT_PRODUCTS/DEFAULT_TABLES against the old Product/BarTable field
// shapes, which no longer exist post Fase 0.
const TRIAL_DAYS = 30;

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const svc = base44.asServiceRole;

    // Re-read the stored profile: auth.me()'s own copy can be stale — the
    // SDK returns User rows (and every entity row) flat, so this reads
    // self.tenant_id directly, never self.data.tenant_id.
    const [self] = await svc.entities.User.filter({ id: user.id });
    if (self?.tenant_id) {
      return Response.json({ error: 'Ya perteneces a un bar', code: 'already_in_a_bar' }, { status: 409 });
    }

    const body = await req.json();
    const name = (body.name || '').toString().trim();
    const address = (body.address || '').toString().trim();
    if (!name) return Response.json({ error: 'El nombre del bar es obligatorio' }, { status: 400 });

    const trialEndAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const bar = await svc.entities.WineBar.create({
      name, address, billing_status: 'trial', trial_end_at: trialEndAt, owner_id: user.id
    });
    await svc.entities.User.update(user.id, {
      tenant_id: bar.id, app_role: 'bar_admin'
    });
    return Response.json({ ok: true, bar_id: bar.id });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}

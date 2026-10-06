import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { buildNewBar } from './_trial_logic.ts';

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
// The 30-day trial rule lives in _trial_logic.ts (computeTrialEnd, tested).

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    // auth.me() throws (not null) without a session; answer 401, not 500
    // (STANDARD module 22 / entrega-1-contratos §1).
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Inicia sesión para continuar', code: 'unauthenticated' }, { status: 401 });
    const svc = base44.asServiceRole;

    // Re-read the stored profile: auth.me()'s own copy can be stale — the
    // SDK returns User rows (and every entity row) flat, so this reads
    // self.tenant_id directly, never self.data.tenant_id.
    const [self] = await svc.entities.User.filter({ id: user.id });
    // A terminal account (terminal mode) is a device, never a bar owner, even
    // after its bar was unlinked by a revoke.
    if (self?.app_role === 'terminal') {
      return Response.json({ error: 'Una terminal no puede crear un bar', code: 'terminal_not_allowed' }, { status: 403 });
    }
    if (self?.tenant_id) {
      return Response.json({ error: 'Ya perteneces a un bar', code: 'already_in_a_bar' }, { status: 409 });
    }

    const body = (await req.json().catch(() => null)) ?? {};
    const name = (body.name || '').toString().trim();
    const address = (body.address || '').toString().trim();
    if (!name) return Response.json({ error: 'El nombre del bar es obligatorio' }, { status: 400 });

    const bar = await svc.entities.WineBar.create(buildNewBar({ name, address, ownerId: user.id }));
    try {
      await svc.entities.User.update(user.id, {
        tenant_id: bar.id, app_role: 'bar_admin'
      });
    } catch (error) {
      // The bar exists but nobody was attached to it (the creator would not be
      // its bar_admin). Roll it back rather than leave an orphan tenant whose
      // owner_id points at someone with no access; report the original failure.
      try {
        await svc.entities.WineBar.delete(bar.id);
      } catch (_) { /* keep reporting the original failure */ }
      throw error;
    }
    return Response.json({ ok: true, bar_id: bar.id });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}

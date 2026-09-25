import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

// The only way a user gets a tenant: User.tenant_id/app_role are rls.write:false
// (Module 24 of jospabloh/acacia-app-standard), so onboarding can no longer set
// them from the browser with updateMe — which also let anyone point themselves
// at another bar's tenant_id and read its data.
const DEFAULT_PRODUCTS = [
  { name: 'Copa de Malbec', type: 'glass', category: 'Tinto', price: 90, stock: 40, low_stock_threshold: 8 },
  { name: 'Copa de Cabernet', type: 'glass', category: 'Tinto', price: 95, stock: 30, low_stock_threshold: 8 },
  { name: 'Copa de Chardonnay', type: 'glass', category: 'Blanco', price: 85, stock: 35, low_stock_threshold: 8 },
  { name: 'Copa de Sauvignon Blanc', type: 'glass', category: 'Blanco', price: 80, stock: 32, low_stock_threshold: 8 },
  { name: 'Copa de Cava Brut', type: 'glass', category: 'Espumoso', price: 100, stock: 25, low_stock_threshold: 6 },
  { name: 'Botella Malbec Reserva', type: 'bottle', category: 'Tinto', price: 480, stock: 12, low_stock_threshold: 3 },
  { name: 'Botella Prosecco', type: 'bottle', category: 'Espumoso', price: 420, stock: 10, low_stock_threshold: 3 },
  { name: 'Aperitivo Aperol', type: 'glass', category: 'Aperitivo', price: 110, stock: 20, low_stock_threshold: 5 }
];
const DEFAULT_TABLES = [
  { name: 'Barra 1', status: 'available', seats: 4 },
  { name: 'Barra 2', status: 'available', seats: 4 },
  { name: 'Mesa 1', status: 'available', seats: 4 },
  { name: 'Mesa 2', status: 'available', seats: 6 }
];

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const svc = base44.asServiceRole;

    // Re-read the stored profile: auth.me()'s .data is not what RLS reads.
    const [self] = await svc.entities.User.filter({ id: user.id });
    const selfData = self?.data ?? {};
    if (selfData.tenant_id) {
      return Response.json({ error: 'Ya perteneces a un bar', code: 'already_in_a_bar' }, { status: 409 });
    }

    const body = await req.json();
    const name = (body.name || '').toString().trim();
    const address = (body.address || '').toString().trim();
    if (!name) return Response.json({ error: 'El nombre del bar es obligatorio' }, { status: 400 });

    const bar = await svc.entities.WineBar.create({
      name, address, subscription_status: 'trial', owner_id: user.id
    });
    await svc.entities.User.update(user.id, {
      data: { ...selfData, tenant_id: bar.id, app_role: 'bar_admin' }
    });
    // Seeding is a convenience: a failure here leaves a usable, empty bar.
    try {
      await svc.entities.Product.bulkCreate(DEFAULT_PRODUCTS.map((p) => ({ ...p, tenant_id: bar.id })));
      await svc.entities.BarTable.bulkCreate(DEFAULT_TABLES.map((t) => ({ ...t, tenant_id: bar.id })));
    } catch (e) {
      console.error('createWineBar: seeding failed', (e as Error).message);
    }
    return Response.json({ ok: true, bar_id: bar.id });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}

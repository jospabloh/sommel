import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

// Onboarding: the ONLY way a user becomes bar_admin. tenant_id and app_role are
// write-locked on User, so the server derives both from the bar it just created
// for the caller — never from the request body.
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.data?.tenant_id) {
      return Response.json({ error: 'Tu cuenta ya pertenece a un bar' }, { status: 409 });
    }

    const body = await req.json();
    const name = (body.name || '').toString().trim();
    const address = (body.address || '').toString().trim();
    if (!name) return Response.json({ error: 'El nombre del bar es obligatorio' }, { status: 400 });

    const bar = await base44.asServiceRole.entities.WineBar.create({
      name,
      address,
      subscription_status: 'trial',
      owner_id: user.id
    });
    await base44.asServiceRole.entities.User.update(user.id, {
      tenant_id: bar.id,
      app_role: 'bar_admin'
    });

    // Seed a small default catalog + tables so POS is usable immediately
    await base44.asServiceRole.entities.Product.bulkCreate([
      { tenant_id: bar.id, name: 'Copa de Malbec', type: 'glass', category: 'Tinto', price: 90, stock: 40, low_stock_threshold: 8 },
      { tenant_id: bar.id, name: 'Copa de Cabernet', type: 'glass', category: 'Tinto', price: 95, stock: 30, low_stock_threshold: 8 },
      { tenant_id: bar.id, name: 'Copa de Chardonnay', type: 'glass', category: 'Blanco', price: 85, stock: 35, low_stock_threshold: 8 },
      { tenant_id: bar.id, name: 'Copa de Sauvignon Blanc', type: 'glass', category: 'Blanco', price: 80, stock: 32, low_stock_threshold: 8 },
      { tenant_id: bar.id, name: 'Copa de Cava Brut', type: 'glass', category: 'Espumoso', price: 100, stock: 25, low_stock_threshold: 6 },
      { tenant_id: bar.id, name: 'Botella Malbec Reserva', type: 'bottle', category: 'Tinto', price: 480, stock: 12, low_stock_threshold: 3 },
      { tenant_id: bar.id, name: 'Botella Prosecco', type: 'bottle', category: 'Espumoso', price: 420, stock: 10, low_stock_threshold: 3 },
      { tenant_id: bar.id, name: 'Aperitivo Aperol', type: 'glass', category: 'Aperitivo', price: 110, stock: 20, low_stock_threshold: 5 }
    ]);
    await base44.asServiceRole.entities.BarTable.bulkCreate([
      { tenant_id: bar.id, name: 'Barra 1', status: 'available', seats: 4 },
      { tenant_id: bar.id, name: 'Barra 2', status: 'available', seats: 4 },
      { tenant_id: bar.id, name: 'Mesa 1', status: 'available', seats: 4 },
      { tenant_id: bar.id, name: 'Mesa 2', status: 'available', seats: 6 }
    ]);

    return Response.json({ ok: true, tenant_id: bar.id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

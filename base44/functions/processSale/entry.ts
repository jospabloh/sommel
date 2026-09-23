import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const tenantId = user.data?.tenant_id;
    if (!tenantId) return Response.json({ error: 'No tenant assigned to this user' }, { status: 403 });

    const body = await req.json();
    const { items, table_id, table_name, type } = body;
    if (!Array.isArray(items) || items.length === 0) {
      return Response.json({ error: 'La cuenta no tiene productos' }, { status: 400 });
    }

    // Fetch products to validate stock
    const productIds = items.map((i: any) => i.product_id).filter(Boolean);
    const products = productIds.length
      ? await base44.entities.Product.filter({ id: { $in: productIds } })
      : [];
    const productMap: Record<string, any> = {};
    products.forEach((p: any) => { productMap[p.id] = p; });

    for (const item of items) {
      if (item.product_id && productMap[item.product_id]) {
        const available = productMap[item.product_id].data.stock;
        if (typeof available === 'number' && available < item.quantity) {
          return Response.json({ error: `Stock insuficiente para ${item.name}` }, { status: 400 });
        }
      }
    }

    const total = items.reduce((sum: number, i: any) => sum + (i.subtotal || i.unit_price * i.quantity || 0), 0);

    const order = await base44.entities.Order.create({
      tenant_id: tenantId,
      table_id: table_id || null,
      table_name: table_name || null,
      type: type || 'bar',
      status: 'paid',
      total,
      items,
      paid_at: new Date().toISOString()
    });

    // Decrement stock for tracked products
    const updates = items
      .filter((i: any) => i.product_id && productMap[i.product_id])
      .map((i: any) => ({
        id: i.product_id,
        stock: productMap[i.product_id].data.stock - i.quantity
      }));
    if (updates.length) await base44.entities.Product.bulkUpdate(updates);

    // Free the table if it was a table order
    if (table_id) {
      try { await base44.entities.BarTable.update(table_id, { status: 'available' }); } catch (e) {}
    }

    return Response.json({ order, total });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
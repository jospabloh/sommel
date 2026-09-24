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

    // Every line must name a product of this bar with a positive whole quantity.
    // Price and total are recomputed from Product.price, never taken from the client.
    for (const item of items) {
      if (!item?.product_id) {
        return Response.json({ error: 'Producto inválido en la cuenta' }, { status: 400 });
      }
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        return Response.json({ error: `Cantidad inválida para ${item.name || 'un producto'}` }, { status: 400 });
      }
    }

    const productIds = [...new Set(items.map((i: any) => i.product_id))];
    const products = await base44.entities.Product.filter({ id: { $in: productIds } });
    const productMap: Record<string, any> = {};
    products.forEach((p: any) => {
      if (p.data?.tenant_id === tenantId) productMap[p.id] = p;
    });

    // Aggregate per product so a split line can't bypass the stock check.
    const qtyByProduct: Record<string, number> = {};
    for (const item of items) {
      const product = productMap[item.product_id];
      if (!product) {
        return Response.json({ error: 'Producto no encontrado en este bar' }, { status: 400 });
      }
      qtyByProduct[item.product_id] = (qtyByProduct[item.product_id] || 0) + item.quantity;
    }
    for (const [id, qty] of Object.entries(qtyByProduct)) {
      const available = productMap[id].data.stock;
      if (typeof available === 'number' && available < qty) {
        return Response.json({ error: `Stock insuficiente para ${productMap[id].data.name}` }, { status: 400 });
      }
    }

    const orderItems = items.map((i: any) => {
      const p = productMap[i.product_id];
      const unit_price = Number(p.data.price) || 0;
      return { product_id: i.product_id, name: p.data.name, unit_price, quantity: i.quantity, subtotal: unit_price * i.quantity };
    });
    const total = orderItems.reduce((sum: number, i: any) => sum + i.subtotal, 0);

    const order = await base44.entities.Order.create({
      tenant_id: tenantId,
      table_id: table_id || null,
      table_name: table_name || null,
      type: type || 'bar',
      status: 'paid',
      total,
      items: orderItems,
      paid_at: new Date().toISOString()
    });

    // Decrement stock for tracked products
    const updates = Object.entries(qtyByProduct)
      .filter(([id]) => typeof productMap[id].data.stock === 'number')
      .map(([id, qty]) => ({ id, stock: productMap[id].data.stock - qty }));
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
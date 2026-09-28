// orders.addItems — entrega-1-contratos.md §4 "orders".
import { loadOwned, requirePermission, requireWritable, hasPermission, httpError, HttpError, redactItemCosts, type Ctx, type Route } from '../_guard.ts';
import { LogicError, resolveItemPricing, validateQty, isOrderOpen } from './_logic.ts';
import { recomputeOrderTotals } from './_shared.ts';

export const addItems: Route = async (ctx: Ctx, body: any) => {
  const order = await loadOwned(ctx, 'Order', body?.order_id);

  await requirePermission(ctx, 'Comandas:tomar');
  requireWritable(ctx);
  // D7: created rows include unit_cost (frozen above) — redact before the
  // response leaves the server unless the caller has Menú:ver_costos.
  const canSeeCosts = await hasPermission(ctx, 'Menú:ver_costos');

  if (!isOrderOpen(order.status)) {
    httpError(409, 'order_closed', 'Esta comanda ya no está abierta');
  }

  const items = Array.isArray(body?.items) ? body.items : [];
  if (items.length === 0) {
    httpError(400, 'items_required', 'Debes agregar al menos un renglón');
  }

  // Resolve every line against the STORED Product before writing anything —
  // one bad line fails the whole call instead of leaving a partial add.
  const resolved: any[] = [];
  for (const raw of items) {
    if (!raw?.product_id) httpError(400, 'product_required', 'Cada renglón necesita un producto');
    const product = await loadOwned(ctx, 'Product', raw.product_id);
    try {
      const qty = validateQty(raw.qty);
      const pricing = resolveItemPricing(product, { variant: raw.variant, modifiers: raw.modifiers });
      resolved.push({
        product_id: raw.product_id,
        qty,
        notes: typeof raw.notes === 'string' ? raw.notes : '',
        ...pricing,
      });
    } catch (err) {
      if (err instanceof LogicError) throw new HttpError(400, err.code, err.message);
      throw err;
    }
  }

  const createdItems: any[] = [];
  for (const line of resolved) {
    const created = await ctx.svc.entities.OrderItem.create({
      // Fixed 2026-09-28: tenant_id must come from the STORED order, not
      // ctx.tenantId — a platform caller has no tenant of their own
      // (ctx.tenantId is null), so writing ctx.tenantId here created
      // OrderItems with tenant_id null when a platform admin added a line to
      // a tenant's order: invisible to that bar's own staff under RLS, while
      // still counted in the order's own totals (recomputeOrderTotals reads
      // by order_id, not tenant_id).
      tenant_id: order.tenant_id,
      order_id: order.id,
      product_id: line.product_id,
      variant: line.variant,
      variant_label: line.variant_label,
      name: line.name,
      unit_price: line.unit_price,
      // Omitted (not null) when the cost is not captured yet: absent reads
      // back as "sin capturar" and needs no nullable schema on the live app.
      ...(line.unit_cost == null ? {} : { unit_cost: line.unit_cost }),
      qty: line.qty,
      modifiers: line.modifiers,
      notes: line.notes,
      station: line.station,
      status: 'nuevo',
      prepared: false,
      created_by: ctx.user.email,
    });
    createdItems.push(created);
  }

  await recomputeOrderTotals(ctx, order.id);

  return { items: redactItemCosts(createdItems, canSeeCosts) };
};

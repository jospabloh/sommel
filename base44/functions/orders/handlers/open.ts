// orders.open — entrega-1-contratos.md §4 "orders".
import { loadOwned, requirePermission, requireWritable, httpError, type Ctx, type Route } from '../_guard.ts';

export const open: Route = async (ctx: Ctx, body: any) => {
  const type = body?.type;
  if (type !== 'mesa' && type !== 'llevar') {
    httpError(400, 'invalid_type', 'El tipo de comanda debe ser "mesa" o "llevar"');
  }

  let table: any = null;
  const tableId = body?.table_id;
  if (type === 'mesa') {
    if (!tableId) httpError(400, 'table_required', 'La mesa es obligatoria para una comanda de tipo mesa');
    table = await loadOwned(ctx, 'BarTable', tableId);
  }

  // Fixed 2026-09-28: an empty/blank customer_name used to be accepted for a
  // 'llevar' order (contract §5 promises "pedidos para llevar CON nombre del
  // cliente" — the client already required this, but the server didn't, so
  // a raw call could still create an anonymous takeaway order the kitchen
  // can't tell apart from another one).
  const customerName = type === 'llevar' ? (body?.customer_name || '').toString().trim() : '';
  if (type === 'llevar' && !customerName) {
    httpError(400, 'customer_name_required', 'El nombre del cliente es obligatorio para pedidos para llevar');
  }

  await requirePermission(ctx, 'Comandas:tomar');
  requireWritable(ctx);

  if (type === 'mesa' && table.status === 'occupied') {
    // Find the order that actually occupies it, so the client can jump there
    // instead of dead-ending on a plain "busy" message.
    const openOrders = await ctx.svc.entities.Order.filter({ tenant_id: ctx.tenantId, status: 'abierta' });
    const existing = openOrders.find((o: any) => (o.table_ids ?? []).includes(table.id));
    // Fixed 2026-09-28: _guard.ts's HttpError now carries an optional
    // `extra` object that handle() spreads into the JSON body, so the
    // existing order's id travels structured (`{ order_id }`) instead of
    // only folded into the message text — the client can navigate straight
    // to it (contract §4) instead of dead-ending on a toast.
    const orderId = existing?.id ?? null;
    httpError(
      409,
      'table_busy',
      orderId ? 'Esa mesa ya tiene una comanda abierta' : 'Esa mesa ya está ocupada',
      orderId ? { order_id: orderId } : undefined
    );
  }

  const now = new Date().toISOString();
  const order = await ctx.svc.entities.Order.create({
    tenant_id: ctx.tenantId,
    type,
    table_ids: type === 'mesa' ? [tableId] : [],
    customer_name: type === 'llevar' ? customerName : undefined,
    status: 'abierta',
    opened_by: ctx.user.email,
    opened_at: now,
    subtotal: 0,
    discount: 0,
    tip: 0,
    total: 0,
  });

  if (type === 'mesa') {
    await ctx.svc.entities.BarTable.update(tableId, { status: 'occupied' });
  }

  return { order };
};

// orders.send — entrega-1-contratos.md §4 "orders". Idempotent: every
// 'nuevo' line becomes 'enviado' with sent_at = now; calling it again with
// nothing left in 'nuevo' just returns an empty list, not an error.
import { loadOwned, requirePermission, requireWritable, hasPermission, httpError, redactItemCosts, type Ctx, type Route } from '../_guard.ts';
import { isOrderOpen, canSendItem } from './_logic.ts';

export const send: Route = async (ctx: Ctx, body: any) => {
  const order = await loadOwned(ctx, 'Order', body?.order_id);

  await requirePermission(ctx, 'Comandas:tomar');
  requireWritable(ctx);

  if (!isOrderOpen(order.status)) {
    httpError(409, 'order_closed', 'Esta comanda ya no está abierta');
  }

  const items = await ctx.svc.entities.OrderItem.filter({ order_id: order.id });
  const toSend = items.filter((i: any) => canSendItem(i.status));

  const now = new Date().toISOString();
  const sent: any[] = [];
  for (const item of toSend) {
    const updated = await ctx.svc.entities.OrderItem.update(item.id, { status: 'enviado', sent_at: now });
    sent.push(updated);
  }

  const canSeeCosts = await hasPermission(ctx, 'Menú:ver_costos');
  return { sent: redactItemCosts(sent, canSeeCosts) };
};

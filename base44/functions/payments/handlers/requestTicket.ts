// payments.requestTicket — entrega-2-contratos.md §5 (Ticket). Creates a
// PrintJob of kind 'ticket'; the print station only paints its lines.
import { loadOwned, requirePermission, requireWritable, pickSurvivor, type Ctx, type Route } from '../_guard.ts';
import { hasCashPayment, paidTotal } from './_logic.ts';
import { buildTicketLines } from './_ticket.ts';
import { barMethods, loadItems, loadPayments, placeOf } from './_shared.ts';

export const requestTicket: Route = async (ctx: Ctx, body: any) => {
  const order = await loadOwned(ctx, 'Order', body?.order_id);
  await requirePermission(ctx, 'Cobro:cobrar');
  requireWritable(ctx);

  const [items, payments, where] = await Promise.all([
    loadItems(ctx, order.id),
    loadPayments(ctx, order.id),
    placeOf(ctx, order),
  ]);
  const paid = paidTotal(payments);
  const dedupeKey = `ticket:${order.id}:${paid}:${order.total ?? 0}`;

  const existing = await ctx.svc.entities.PrintJob.filter({ tenant_id: ctx.tenantId, dedupe_key: dedupeKey });
  if (existing.length > 0) return { job: pickSurvivor(existing) };

  const bar = ctx.bar ?? {};
  const lines = buildTicketLines({
    bar: { name: bar.name, ticket_header: bar.ticket_header, ticket_footer: bar.ticket_footer, rfc: bar.rfc },
    when: order.status === 'cobrada' && order.closed_at ? order.closed_at : new Date().toISOString(),
    place: where.place,
    items,
    order: {
      subtotal: order.subtotal ?? 0,
      discount: order.discount ?? 0,
      discount_kind: order.discount_kind,
      discount_reason: order.discount_reason,
      tip: order.tip ?? 0,
      total: order.total ?? 0,
    },
    payments,
  });

  const created = await ctx.svc.entities.PrintJob.create({
    tenant_id: ctx.tenantId,
    kind: 'ticket',
    title: where.title,
    lines,
    source_id: order.id,
    dedupe_key: dedupeKey,
    // The station pulses the drawer only for a sale paid (partly) in cash.
    open_drawer: hasCashPayment(payments, barMethods(ctx)),
    status: 'pendiente',
    attempts: 0,
  });

  // Re-read after writing; a concurrent twin loses (marked, never deleted).
  const rows = await ctx.svc.entities.PrintJob.filter({ tenant_id: ctx.tenantId, dedupe_key: dedupeKey });
  const survivor = pickSurvivor(rows) ?? created;
  for (const row of rows) {
    if (row.id !== survivor.id && row.status === 'pendiente') {
      await ctx.svc.entities.PrintJob.update(row.id, { status: 'fallido', error: 'duplicado' });
    }
  }
  return { job: survivor };
};

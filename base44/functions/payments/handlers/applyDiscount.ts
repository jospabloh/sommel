// payments.applyDiscount — entrega-2-contratos.md §5.
import { loadOwned, requirePermission, requireWritable, httpError, type Ctx, type Route } from '../_guard.ts';
import { planDiscount, paidTotal } from './_logic.ts';
import { assertOrderOpen, loadItems, loadPayments, rethrow, writeTotals } from './_shared.ts';
import { recordApproval, requireApproval } from '../_approval.ts';

export const applyDiscount: Route = async (ctx: Ctx, body: any) => {
  const order = await loadOwned(ctx, 'Order', body?.order_id);
  await requirePermission(ctx, 'Cobro:descuento');
  requireWritable(ctx);
  assertOrderOpen(order);

  const items = await loadItems(ctx, order.id);
  const subtotal = items.reduce(
    (s: number, i: any) => (i.status === 'cancelado' ? s : s + Math.round((i.unit_price ?? 0) * (i.qty ?? 0))),
    0
  );

  let plan;
  try {
    plan = planDiscount({ kind: body?.kind, pct: body?.pct, amount: body?.amount, reason: body?.reason, subtotal });
  } catch (err) {
    rethrow(err);
  }

  if (paidTotal(await loadPayments(ctx, order.id)) > 0) {
    httpError(409, 'has_payments', 'Ya hay pagos registrados. Anúlalos antes de cambiar el descuento.');
  }

  // Manager approval for any discount or comp; removing one (discount 0)
  // only raises the bill, so it needs nobody's OK.
  const approval = plan.discount > 0 ? await requireApproval(ctx, body, 'discount') : null;

  const updated = await writeTotals(ctx, order, { ...plan });
  await recordApproval(ctx, approval, {
    targetId: order.id,
    detail: `${plan.discount_kind === 'cortesia' ? 'Cortesía' : 'Descuento'}: ${plan.discount_reason}`,
  });
  return { order: updated };
};

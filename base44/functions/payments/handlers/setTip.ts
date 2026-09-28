// payments.setTip — entrega-2-contratos.md §5.
import { loadOwned, requirePermission, requireWritable, httpError, type Ctx, type Route } from '../_guard.ts';
import { planTip, paidTotal } from './_logic.ts';
import { assertOrderOpen, loadPayments, rethrow, writeTotals } from './_shared.ts';

export const setTip: Route = async (ctx: Ctx, body: any) => {
  const order = await loadOwned(ctx, 'Order', body?.order_id);
  await requirePermission(ctx, 'Cobro:cobrar');
  requireWritable(ctx);
  assertOrderOpen(order);

  let plan;
  try {
    // A percentage tip is taken over subtotal minus discount (computeOrderTotals).
    plan = planTip({ pct: body?.pct, amount: body?.amount, base: (order.subtotal ?? 0) - (order.discount ?? 0) });
  } catch (err) {
    rethrow(err);
  }

  if (paidTotal(await loadPayments(ctx, order.id)) > 0) {
    httpError(409, 'has_payments', 'Ya hay pagos registrados. Anúlalos antes de cambiar la propina.');
  }

  // Only the setting is stored; writeTotals derives the centavos from it.
  const patch = plan.tip_pct !== null ? { tip_pct: plan.tip_pct, tip: 0 } : { tip_pct: null, tip: plan.tip };
  const updated = await writeTotals(ctx, order, patch);
  return { order: updated };
};

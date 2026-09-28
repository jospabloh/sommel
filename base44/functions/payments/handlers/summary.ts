// payments.summary — entrega-2-contratos.md §5. Read only: no billing gate.
import { loadOwned, requirePermission, hasPermission, redactItemCosts, type Ctx, type Route } from '../_guard.ts';
import { remainingOf } from './_logic.ts';
import { barMethods, loadItems, loadPayments, findOpenShift } from './_shared.ts';

export const summary: Route = async (ctx: Ctx, body: any) => {
  const order = await loadOwned(ctx, 'Order', body?.order_id);
  await requirePermission(ctx, 'Cobro:cobrar');

  const [items, payments, shift] = await Promise.all([
    loadItems(ctx, order.id),
    loadPayments(ctx, order.id),
    findOpenShift(ctx),
  ]);
  const canSeeCosts = await hasPermission(ctx, 'Menú:ver_costos');

  return {
    order,
    items: redactItemCosts(items, canSeeCosts),
    payments,
    remaining: order.status === 'abierta' ? remainingOf(order.total ?? 0, payments) : 0,
    methods: barMethods(ctx).filter((m) => m.active),
    shift_open: !!shift,
  };
};

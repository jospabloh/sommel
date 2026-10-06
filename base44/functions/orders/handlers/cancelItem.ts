// orders.cancelItem — entrega-1-contratos.md §4 "orders". Only a line
// already sent ('enviado'/'listo') can be cancelled this way — a 'nuevo'
// line is removed outright via `removeItem` instead, and 'entregado'/
// 'cancelado' are terminal. Motivo obligatorio (§3 "queda registrado quién y
// por qué"). Like updateItem/removeItem, it also rejects a non-'abierta'
// order with 409 'order_closed' (contract §4) — fixed 2026-09-28: this
// handler used to skip that check entirely, so a line on a closed/cobrada
// order could still be cancelled and its totals recomputed.
import { loadOwned, requirePermission, requireWritable, hasPermission, httpError, HttpError, redactItemCost, type Ctx, type Route } from '../_guard.ts';
import { LogicError, validateReason, isOrderOpen, canCancelItem } from './_logic.ts';
import { recomputeOrderTotals, assertTotalCoversPayments } from './_shared.ts';
import { recordApproval, requireApproval } from '../_approval.ts';

export const cancelItem: Route = async (ctx: Ctx, body: any) => {
  const item = await loadOwned(ctx, 'OrderItem', body?.item_id);
  const order = await loadOwned(ctx, 'Order', item.order_id);

  await requirePermission(ctx, 'Comandas:cancelar_enviado');
  requireWritable(ctx);

  if (!isOrderOpen(order.status)) {
    httpError(409, 'order_closed', 'Esta comanda ya no está abierta');
  }

  let reason: string;
  try {
    reason = validateReason(body?.reason);
  } catch (err) {
    if (err instanceof LogicError) throw new HttpError(400, err.code, err.message);
    throw err;
  }

  if (!canCancelItem(item.status)) {
    httpError(409, 'invalid_status', 'Solo se puede cancelar un renglón ya enviado');
  }

  await assertTotalCoversPayments(ctx, order, item.id);

  // Manager approval: staff needs an admin's PIN; checked after every other
  // validation so a bad request never spends an attempt of that PIN.
  const approval = await requireApproval(ctx, body, 'cancel_sent_item');

  const updated = await ctx.svc.entities.OrderItem.update(item.id, {
    status: 'cancelado',
    cancel_reason: reason,
    cancelled_by: ctx.user.email,
    prepared: !!body?.prepared,
  });

  await recomputeOrderTotals(ctx, item.order_id);
  await recordApproval(ctx, approval, { targetId: item.id, detail: `${item.name ?? 'Renglón'}: ${reason}` });

  const canSeeCosts = await hasPermission(ctx, 'Menú:ver_costos');
  return { item: redactItemCost(updated, canSeeCosts) };
};

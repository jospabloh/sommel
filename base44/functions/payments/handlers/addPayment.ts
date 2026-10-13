// payments.addPayment — entrega-2-contratos.md §5 "Reglas de addPayment".
// Order of work: guard order (loadOwned -> permission -> requireWritable),
// idempotent lookup, validation, write, reconcile after write, then the
// auto-close (status, tables, inventory).
import { loadOwned, requirePermission, requireWritable, httpError, type Ctx, type Route } from '../_guard.ts';
import {
  resolveMethod,
  computeCash,
  validatePaymentAmount,
  validateIdempotencyKey,
  remainingOf,
  paidTotal,
  shouldClose,
  canCloseWithoutPayment,
  canTipPerPayment,
  paymentTips,
  planPaymentTip,
} from './_logic.ts';
import {
  assertOrderOpen,
  barMethods,
  deductInventory,
  findOpenShift,
  loadPayments,
  reconcilePayments,
  rethrow,
  setTablesStatus,
  writeTotals,
} from './_shared.ts';

export const addPayment: Route = async (ctx: Ctx, body: any) => {
  const order = await loadOwned(ctx, 'Order', body?.order_id);
  await requirePermission(ctx, 'Cobro:cobrar');
  requireWritable(ctx);

  let key: string;
  try {
    key = validateIdempotencyKey(body?.idempotency_key);
  } catch (err) {
    rethrow(err);
  }

  // Lookup BEFORE anything else: a retry of an attempt that already went
  // through must answer with that payment even though the order has since
  // closed. Same key on another order is a client bug, not a retry.
  const prior = await ctx.svc.entities.Payment.filter({ tenant_id: ctx.tenantId, idempotency_key: key });
  if (prior.length > 0) {
    const existing = await reconcilePayments(ctx, key);
    if (existing.order_id !== order.id) {
      httpError(409, 'idempotency_conflict', 'Esa llave ya se usó en otra comanda');
    }
    const [fresh] = await ctx.svc.entities.Order.filter({ id: order.id });
    const all = await loadPayments(ctx, order.id);
    return {
      payment: existing,
      order: fresh ?? order,
      remaining: remainingOf((fresh ?? order).total ?? 0, all),
      change: existing.change ?? 0,
      closed: (fresh ?? order).status === 'cobrada',
    };
  }

  assertOrderOpen(order);

  const shift = await findOpenShift(ctx);
  if (!shift) httpError(409, 'no_open_shift', 'Abre el turno antes de cobrar');

  let method, amount, cash;
  // `amount` is this payer's share of the bill; their own tip (if any) goes
  // on top of it and is not limited by what is still owed.
  let tip = 0;
  const payments = await loadPayments(ctx, order.id);
  const remaining = remainingOf(order.total ?? 0, payments);
  try {
    method = resolveMethod(barMethods(ctx), body?.method);
    // Cortesia: nothing to collect, but the order still has to be closed.
    if (body?.amount === 0 && canCloseWithoutPayment(order, paidTotal(payments))) {
      amount = 0;
      cash = {};
    } else {
      amount = validatePaymentAmount(body?.amount, remaining);
      tip = planPaymentTip(body?.tip, amount);
      cash = computeCash(method, amount + tip, body?.received);
    }
  } catch (err) {
    rethrow(err);
  }
  if (tip > 0 && !canTipPerPayment(order, payments)) {
    httpError(409, 'order_tip_set', 'Esta cuenta ya tiene una propina general. Quítala para dar propina en cada pago.');
  }

  const splitLabel = typeof body?.split_label === 'string' ? body.split_label.trim().slice(0, 60) : '';
  const created = await ctx.svc.entities.Payment.create({
    tenant_id: ctx.tenantId,
    order_id: order.id,
    shift_id: shift.id,
    method: method.key,
    method_label: method.label,
    amount: amount + tip,
    ...(tip > 0 ? { tip } : {}),
    ...cash,
    ...(splitLabel ? { split_label: splitLabel } : {}),
    idempotency_key: key,
    created_by: ctx.user?.email,
  });

  // Re-read after writing; if a concurrent twin exists, the oldest wins and
  // the others are voided as 'duplicado'.
  const payment = (await reconcilePayments(ctx, key)) ?? created;

  let live = await loadPayments(ctx, order.id);
  let current = order;
  // A payment that carries a tip moves the order's tip (and total) with it.
  // Derived from the live payments, not added to the stored value, so two
  // payers tipping at the same time cannot overwrite each other.
  const syncTips = async () => {
    // canTipPerPayment was checked before writing: the order's tip is the
    // sum of its payment tips, so recomputing it from them is exact.
    if ((current.tip ?? 0) !== paymentTips(live)) {
      current = await writeTotals(ctx, current, { tip_pct: null, tip: paymentTips(live) });
    }
  };
  if (tip > 0) await syncTips();
  const total = current.total ?? 0;

  // Two cashiers with different keys can both pass the pre-write check. If the
  // live payments now exceed the total and this one is the newest of them
  // (created_date, id tiebreak), it is the one that overpaid: void it.
  if (amount > 0 && paidTotal(live) > total && !payment.voided_at) {
    const rows = live
      .filter((p: any) => !p.voided_at)
      .sort((a: any, b: any) => String(a.created_date).localeCompare(String(b.created_date)) || String(a.id).localeCompare(String(b.id)));
    if (rows[rows.length - 1]?.id === payment.id) {
      await ctx.svc.entities.Payment.update(payment.id, {
        voided_at: new Date().toISOString(),
        voided_by: 'sistema',
        void_reason: 'excede_total',
      });
      if (tip > 0) {
        live = await loadPayments(ctx, order.id);
        await syncTips();
      }
      httpError(409, 'amount_exceeds_remaining', 'Otra caja ya cobró esta cuenta. Devuelve el dinero recibido');
    }
  }
  const paid = paidTotal(live);
  const closing = shouldClose(total, paid) || (total === 0 && amount === 0 && payment.id === created.id);

  let updated;
  let inventoryWarning: string | null = null;
  if (closing) {
    updated = await ctx.svc.entities.Order.update(order.id, {
      status: 'cobrada',
      closed_at: new Date().toISOString(),
      closed_by: ctx.user?.email,
      shift_id: shift.id,
      paid,
    });
    await setTablesStatus(ctx, order, 'available');
    inventoryWarning = await deductInventory(ctx, order.id);
  } else {
    updated = await ctx.svc.entities.Order.update(order.id, { paid });
  }

  return {
    payment,
    order: updated,
    remaining: Math.max(0, total - paid),
    change: payment.change ?? 0,
    closed: closing,
    ...(inventoryWarning ? { inventory_warning: inventoryWarning } : {}),
  };
};

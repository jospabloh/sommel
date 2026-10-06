// Impure helpers shared across `shifts` handlers. Not import-free (they touch
// `Ctx`/`svc`), so they live apart from `_logic.ts`, which `deno test` must be
// able to load with zero imports.
import {
  BAR_UTC_OFFSET_MIN,
  DEFAULT_PAYMENT_METHODS,
  padLine,
  type Ctx,
} from '../_guard.ts';
import {
  buildCorteEmail,
  buildCorteLines,
  buildSummary,
  computeExpectedCash,
  cashMethodKeys,
  salesByMethod,
  type CorteMeta,
  type CorteSummary,
  type MethodDef,
} from './_logic.ts';

/** The bar's payment methods, or the defaults when it has not customised them. */
export function barMethods(ctx: Ctx): MethodDef[] {
  const m = ctx.bar?.payment_methods;
  return Array.isArray(m) && m.length > 0 ? m : DEFAULT_PAYMENT_METHODS;
}

/** Open shifts of the tenant, oldest first (there should be at most one). */
export async function listOpenShifts(ctx: Ctx): Promise<any[]> {
  const all = await ctx.svc.entities.Shift.filter({ tenant_id: ctx.tenantId });
  return all
    .filter((s: any) => !s.closed_at)
    .sort((a: any, b: any) => String(a.created_date).localeCompare(String(b.created_date)) || String(a.id).localeCompare(String(b.id)));
}

export async function findOpenShift(ctx: Ctx): Promise<any | null> {
  const open = await listOpenShifts(ctx);
  return open[0] ?? null;
}

/** Payments and cash movements recorded against a shift. */
export async function loadShiftMoney(ctx: Ctx, shiftId: string) {
  const [payments, cashMovements] = await Promise.all([
    ctx.svc.entities.Payment.filter({ tenant_id: ctx.tenantId, shift_id: shiftId }),
    ctx.svc.entities.CashMovement.filter({ tenant_id: ctx.tenantId, shift_id: shiftId }),
  ]);
  return { payments, cashMovements };
}

async function inChunks<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
}

/**
 * Orders that had a live payment in this shift, plus the count of cancelled
 * lines: cancelled lines of those orders and of orders opened during the
 * shift that were cancelled outright.
 */
export async function loadOrdersAndCancellations(ctx: Ctx, shift: any, payments: any[]) {
  const orderIds = [...new Set(payments.filter((p) => !p.voided_at && p.order_id).map((p) => p.order_id as string))];
  const orders = (
    await inChunks(orderIds, 20, async (id) => {
      const [o] = await ctx.svc.entities.Order.filter({ id });
      return o;
    })
  ).filter((o) => o && o.tenant_id === ctx.tenantId);

  const itemLists = await inChunks<string, any[]>(orderIds, 20, (id) => ctx.svc.entities.OrderItem.filter({ order_id: id }));
  let cancelledItems = 0;
  for (const list of itemLists) cancelledItems += list.filter((i: any) => i.status === 'cancelado').length;

  // Orders cancelled outright during the shift (their lines are all cancelled).
  const cancelledOrders = await ctx.svc.entities.Order.filter({ tenant_id: ctx.tenantId, status: 'cancelada' });
  const duringShift = cancelledOrders.filter(
    (o: any) => !orderIds.includes(o.id) && String(o.opened_at ?? o.created_date ?? '') >= String(shift.opened_at ?? '')
  );
  const cancelledLists = await inChunks<any, any[]>(duringShift, 20, (o: any) => ctx.svc.entities.OrderItem.filter({ order_id: o.id }));
  for (const list of cancelledLists) cancelledItems += list.filter((i: any) => i.status === 'cancelado').length;

  return { orders, cancelledItems };
}

/** Running numbers of an open shift, for `current`. */
export async function runningTotals(ctx: Ctx, shift: any) {
  const { payments, cashMovements } = await loadShiftMoney(ctx, shift.id);
  const methods = barMethods(ctx);
  const totals = salesByMethod(payments, methods);
  const cash = computeExpectedCash({
    opening_float: shift.opening_float ?? 0,
    payments,
    cashKeys: cashMethodKeys(methods),
    cashMovements,
  });
  return { payments, cashMovements, totals, cash };
}

export async function computeClosingSummary(ctx: Ctx, shift: any, countedCash: number, comment: string): Promise<CorteSummary> {
  const { payments, cashMovements } = await loadShiftMoney(ctx, shift.id);
  const { orders, cancelledItems } = await loadOrdersAndCancellations(ctx, shift, payments);
  return buildSummary({
    opening_float: shift.opening_float ?? 0,
    payments,
    methods: barMethods(ctx),
    paidOrders: orders,
    cancelledItems,
    cashMovements: cashMovements.sort((a: any, b: any) => String(a.created_date).localeCompare(String(b.created_date))),
    counted_cash: countedCash,
    comment,
  });
}

export function corteMeta(ctx: Ctx, shift: any): CorteMeta {
  return {
    bar_name: ctx.bar?.name || 'Sommel',
    opened_at: shift.opened_at,
    closed_at: shift.closed_at,
    opened_by: shift.opened_by,
    closed_by: shift.closed_by,
  };
}

export function corteLines(ctx: Ctx, shift: any) {
  return buildCorteLines(corteMeta(ctx, shift), shift.summary, BAR_UTC_OFFSET_MIN, padLine);
}

export interface EmailOutcome {
  email_status: 'enviado' | 'fallido';
  email_sent_at?: string;
  email_error: string;
}

/**
 * Sends the corte to every address in `WineBar.corte_emails`, one message per
 * recipient. NEVER throws: a mail problem must not undo a saved close.
 */
export async function deliverCorteEmail(ctx: Ctx, shift: any): Promise<EmailOutcome> {
  try {
    const recipients: string[] = Array.isArray(ctx.bar?.corte_emails) ? ctx.bar.corte_emails.filter(Boolean) : [];
    if (recipients.length === 0) return { email_status: 'fallido', email_error: 'sin_destinatarios' };
    if (!shift.summary) return { email_status: 'fallido', email_error: 'sin_resumen' };

    const { subject, body } = buildCorteEmail(corteMeta(ctx, shift), shift.summary, BAR_UTC_OFFSET_MIN);
    const failures: string[] = [];
    for (const to of recipients) {
      try {
        await ctx.svc.integrations.Core.SendEmail({ to, subject, body });
      } catch (err) {
        failures.push(`${to}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (failures.length > 0) return { email_status: 'fallido', email_error: failures.join('; ').slice(0, 500) };
    return { email_status: 'enviado', email_sent_at: new Date().toISOString(), email_error: '' };
  } catch (err) {
    return { email_status: 'fallido', email_error: (err instanceof Error ? err.message : String(err)).slice(0, 500) };
  }
}

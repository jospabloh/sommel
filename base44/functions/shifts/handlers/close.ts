// shifts.close — entrega-2-contratos.md §5. Blind close: the client sends only
// what it counted; the server computes the expected cash AFTER receiving it.
//
// A non-zero difference without a comment answers 409 `comment_required`
// WITHOUT any figure (not even in the message), so the count cannot be
// adjusted toward what "should" come out.
import {
  HttpError,
  hasPermission,
  httpError,
  requirePermission,
  requireWritable,
  type Ctx,
  type Route,
} from '../_guard.ts';
import { LogicError, normalizeComment, redactShift, requiresComment, validateCountedCash } from './_logic.ts';
import { computeClosingSummary, deliverCorteEmail, findOpenShift } from './_shared.ts';
import { recordApproval, requireApproval } from '../_approval.ts';

export const close: Route = async (ctx: Ctx, body: any) => {
  await requirePermission(ctx, 'Turno:operar');
  requireWritable(ctx);

  let counted: number;
  let comment: string;
  try {
    counted = validateCountedCash(body?.counted_cash);
    comment = normalizeComment(body?.comment);
  } catch (err) {
    if (err instanceof LogicError) throw new HttpError(400, err.code, err.message);
    throw err;
  }

  const shift = await findOpenShift(ctx);
  if (!shift) httpError(409, 'no_open_shift', 'No hay un turno abierto');

  const openOrders = await ctx.svc.entities.Order.filter({ tenant_id: ctx.tenantId, status: 'abierta' });
  if (openOrders.length > 0) {
    httpError(
      409,
      'open_orders',
      openOrders.length === 1
        ? 'Hay 1 cuenta abierta. Cóbrala o cancélala antes de cerrar el turno'
        : `Hay ${openOrders.length} cuentas abiertas. Cóbralas o cancélalas antes de cerrar el turno`,
      { count: openOrders.length }
    );
  }

  const summary = await computeClosingSummary(ctx, shift, counted, comment);
  if (requiresComment(summary.difference, comment)) {
    httpError(409, 'comment_required', 'El conteo no coincide con lo esperado. Agrega un comentario para cerrar el turno');
  }

  // Manager approval, after the blind-count checks (see orders.cancelItem).
  const approval = await requireApproval(ctx, body, 'close_shift');

  // Someone else may have closed it while we were computing.
  const [fresh] = await ctx.svc.entities.Shift.filter({ id: shift.id });
  if (!fresh || fresh.closed_at) httpError(409, 'no_open_shift', 'Este turno ya se cerró');

  const closedAt = new Date().toISOString();
  const closed = await ctx.svc.entities.Shift.update(shift.id, {
    closed_at: closedAt,
    closed_by: ctx.user.email,
    counted_cash: counted,
    expected_cash: summary.expected_cash,
    difference: summary.difference,
    close_comment: comment,
    summary,
    email_status: 'pendiente',
  });

  await recordApproval(ctx, approval, { targetId: shift.id, detail: comment || 'Cierre de turno' });

  // The close is saved; a mail problem never reopens or fails it.
  const outcome = await deliverCorteEmail(ctx, { ...shift, ...closed, closed_at: closedAt, summary });
  const finalShift = await ctx.svc.entities.Shift.update(shift.id, {
    email_status: outcome.email_status,
    email_sent_at: outcome.email_sent_at,
    email_error: outcome.email_error,
  });

  const canSeeCorte = await hasPermission(ctx, 'Turno:ver_corte');
  return {
    shift: redactShift(finalShift, canSeeCorte),
    email_status: outcome.email_status,
    email_error: outcome.email_error,
  };
};

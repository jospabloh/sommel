// shifts.voidCashOut (2026-10-14, José): undo a withdrawal registered by
// mistake, while its shift is still open. The row is neutralised (amount 0,
// the original kept in `voided_amount`), never deleted, the same convention
// as a duplicate; the corte and the expected cash stop counting it. A staff
// member needs a manager's approval, like registering one.
import { HttpError, httpError, loadOwned, requirePermission, requireWritable, type Ctx, type Route } from '../_guard.ts';
import { cashOutVoidBlocker } from './_logic.ts';
import { findOpenShift } from './_shared.ts';
import { recordApproval, requireApproval } from '../_approval.ts';

const MESSAGES: Record<string, [number, string]> = {
  already_voided: [409, 'Este retiro ya está anulado'],
  not_a_withdrawal: [409, 'Este movimiento no es un retiro'],
  shift_closed: [409, 'Solo se puede anular un retiro del turno abierto'],
};

export const voidCashOut: Route = async (ctx: Ctx, body: any) => {
  const movement = await loadOwned(ctx, 'CashMovement', body?.movement_id);
  await requirePermission(ctx, 'Turno:operar');
  requireWritable(ctx);

  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  if (!reason) httpError(400, 'reason_required', 'Escribe por qué se anula el retiro');
  if (reason.length > 200) httpError(400, 'reason_too_long', 'El motivo es demasiado largo (máximo 200 caracteres)');

  const shift = await findOpenShift(ctx);
  const blocker = cashOutVoidBlocker(movement, shift?.id ?? null);
  if (blocker) {
    const [status, message] = MESSAGES[blocker];
    throw new HttpError(status, blocker, message);
  }

  const approval = await requireApproval(ctx, body, 'void_cash_out');
  const updated = await ctx.svc.entities.CashMovement.update(movement.id, {
    amount: 0,
    voided_amount: movement.amount,
    voided_at: new Date().toISOString(),
    voided_by: ctx.user?.email,
    void_reason: reason,
  });
  await recordApproval(ctx, approval, { targetId: movement.id, detail: reason });
  return { movement: updated };
};

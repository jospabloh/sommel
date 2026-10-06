// shifts.addCashOut — entrega-2-contratos.md §5. The amount arrives positive
// (how much left the drawer) and is stored NEGATIVE. Idempotent by
// `idempotency_key`: a retry returns the same movement (§1).
import { HttpError, httpError, pickSurvivor, requirePermission, requireWritable, type Ctx, type Route } from '../_guard.ts';
import { LogicError, validateCashOut } from './_logic.ts';
import { findOpenShift } from './_shared.ts';
import { recordApproval, requireApproval } from '../_approval.ts';

export const addCashOut: Route = async (ctx: Ctx, body: any) => {
  await requirePermission(ctx, 'Turno:operar');
  requireWritable(ctx);

  let input;
  try {
    input = validateCashOut(body);
  } catch (err) {
    if (err instanceof LogicError) throw new HttpError(400, err.code, err.message);
    throw err;
  }

  const shift = await findOpenShift(ctx);
  if (!shift) httpError(409, 'no_open_shift', 'No hay un turno abierto');

  const sameKey = async () =>
    (await ctx.svc.entities.CashMovement.filter({ tenant_id: ctx.tenantId, idempotency_key: input.idempotency_key })).filter(
      (m: any) => m.shift_id === shift.id
    );

  const existing = pickSurvivor(await sameKey());
  if (existing) return { movement: existing };

  // Manager approval, after validation and the idempotent replay (a retry of a
  // withdrawal already approved never asks again).
  const approval = await requireApproval(ctx, body, 'cash_out');

  const created = await ctx.svc.entities.CashMovement.create({
    tenant_id: ctx.tenantId,
    shift_id: shift.id,
    amount: -input.amount,
    reason: input.reason,
    idempotency_key: input.idempotency_key,
    created_by: ctx.user.email,
  });

  // Re-read: concurrent retries may each have created one. The oldest wins;
  // the rest are neutralised (amount 0), never deleted (§1).
  const rows = await sameKey();
  const survivor = pickSurvivor(rows) ?? created;
  for (const row of rows) {
    if (row.id !== survivor.id && (row.amount ?? 0) !== 0) {
      await ctx.svc.entities.CashMovement.update(row.id, { amount: 0, reason: 'duplicado' });
    }
  }
  if (survivor.id === created.id) await recordApproval(ctx, approval, { targetId: created.id, detail: input.reason });
  return { movement: survivor };
};

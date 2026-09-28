// shifts.open — entrega-2-contratos.md §5. One open shift per bar: 409
// `shift_open` when there already is one.
import { HttpError, httpError, requirePermission, requireWritable, type Ctx, type Route } from '../_guard.ts';
import { LogicError, validateOpeningFloat } from './_logic.ts';
import { listOpenShifts } from './_shared.ts';

export const open: Route = async (ctx: Ctx, body: any) => {
  await requirePermission(ctx, 'Turno:operar');
  requireWritable(ctx);

  let openingFloat: number;
  try {
    openingFloat = validateOpeningFloat(body?.opening_float ?? 0);
  } catch (err) {
    if (err instanceof LogicError) throw new HttpError(400, err.code, err.message);
    throw err;
  }

  if ((await listOpenShifts(ctx)).length > 0) {
    httpError(409, 'shift_open', 'Ya hay un turno abierto');
  }

  const shift = await ctx.svc.entities.Shift.create({
    tenant_id: ctx.tenantId,
    opened_at: new Date().toISOString(),
    opened_by: ctx.user.email,
    opening_float: openingFloat,
    email_status: 'pendiente',
  });

  // Re-read after creating: two devices opening at once both passed the check
  // above. The oldest survives; a loser removes its own row (a shift with no
  // money on it yet, so deleting is safe) and answers like the check would.
  const openNow = await listOpenShifts(ctx);
  if (openNow.length > 1 && openNow[0].id !== shift.id) {
    await ctx.svc.entities.Shift.delete(shift.id);
    httpError(409, 'shift_open', 'Ya hay un turno abierto');
  }

  return { shift };
};

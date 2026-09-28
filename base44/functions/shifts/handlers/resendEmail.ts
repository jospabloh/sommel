// shifts.resendEmail — entrega-2-contratos.md §5. Rebuilds the message from
// the frozen `summary`, so a resend always says what the close said.
import { httpError, loadOwned, requirePermission, requireWritable, type Ctx, type Route } from '../_guard.ts';
import { deliverCorteEmail } from './_shared.ts';

export const resendEmail: Route = async (ctx: Ctx, body: any) => {
  const shift = await loadOwned(ctx, 'Shift', body?.shift_id);
  await requirePermission(ctx, 'Turno:ver_corte');
  requireWritable(ctx);
  if (!shift.closed_at) httpError(409, 'shift_not_closed', 'El turno sigue abierto. Ciérralo para mandar el corte');

  const outcome = await deliverCorteEmail(ctx, shift);
  await ctx.svc.entities.Shift.update(shift.id, {
    email_status: outcome.email_status,
    email_sent_at: outcome.email_sent_at ?? shift.email_sent_at,
    email_error: outcome.email_error,
  });
  return { email_status: outcome.email_status, email_error: outcome.email_error };
};

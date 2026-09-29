// settings.billing: the license notice for the banner. Membership only, on
// purpose: requireContext already refuses callers with no bar (403 no_tenant),
// so no permission key is needed. Gating this behind Cobro/Ajustes/Estaciones
// would hide the "why is everything read-only" explanation from exactly the
// staff whose writes are being refused. Returns the license fields the Cuenta page shows (status, trial end, plan,
// paid-until, bar name) plus `is_owner`, nothing else.
import { httpError, type Ctx, type Route } from '../_guard.ts';

export const billing: Route = async (ctx: Ctx) => {
  if (!ctx.bar) httpError(404, 'not_found', 'No se encontró el bar');
  return {
    bar: {
      name: ctx.bar.name ?? '',
      plan: ctx.bar.plan ?? null,
      current_period_end: ctx.bar.current_period_end ?? null,
      is_owner: !!ctx.self?.id && !!ctx.bar.owner_id && ctx.bar.owner_id === ctx.self.id,
      billing_status: ctx.bar.billing_status ?? null,
      trial_end_at: ctx.bar.trial_end_at ?? null,
    },
  };
};

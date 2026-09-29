// settings.billing: the license notice for the banner. Membership only, on
// purpose: requireContext already refuses callers with no bar (403 no_tenant),
// so no permission key is needed. Gating this behind Cobro/Ajustes/Estaciones
// would hide the "why is everything read-only" explanation from exactly the
// staff whose writes are being refused. Returns two license fields, nothing else.
import { httpError, type Ctx, type Route } from '../_guard.ts';

export const billing: Route = async (ctx: Ctx) => {
  if (!ctx.bar) httpError(404, 'not_found', 'No se encontró el bar');
  return {
    bar: {
      billing_status: ctx.bar.billing_status ?? null,
      trial_end_at: ctx.bar.trial_end_at ?? null,
    },
  };
};

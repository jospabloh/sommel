// stations.getConfig — entrega-1-contratos.md §4 "stations". Read-only: the
// Estaciones screen needs `WineBar.prep_goal_kitchen_min`/`prep_goal_bar_min`
// (and the bar's name, for the header) to compute its heat bar, but the
// client CANNOT read `WineBar` directly — verified live 2026-09-28:
// `WineBar.get`/`filter`/`list` all return nothing for a normal user,
// because the entity-side rule `{"id":"{{user.data.tenant_id}}"}` never
// matches a flat row's `id` against a template that (per this app's own
// convention, contract §1) never resolves under `data.`. That RLS rule is
// NOT loosened here — this endpoint reads `ctx.bar` (already loaded by
// `requireContext` via `asServiceRole`) and hands back only the fields the
// screen needs, nothing else off the row.
//
// It also carries the two license fields the persistent billing banner in
// Layout.jsx needs (`billing_status`, `trial_end_at`): read-only, so a
// suspended/view_only bar can still be told WHY it is locked. The client
// never decides anything from them, it only shows text.
//
// No `requireWritable` on purpose: this is a read, and a suspended/
// view_only bar's staff still need to see their own prep goals.
import { httpError, type Ctx, type Route } from '../_guard.ts';
import { allowedStations } from './_access.ts';

export const getConfig: Route = async (ctx: Ctx) => {
  // Phase 3: either station key opens the screen; `stations` says which.
  const stations = await allowedStations(ctx);
  if (!stations.kitchen && !stations.bar) httpError(403, 'forbidden', 'No tienes permiso para esta acción');

  if (!ctx.bar) {
    httpError(404, 'not_found', 'No se encontró el bar');
  }

  return {
    bar: {
      name: ctx.bar.name ?? '',
      prep_goal_kitchen_min: ctx.bar.prep_goal_kitchen_min ?? null,
      prep_goal_bar_min: ctx.bar.prep_goal_bar_min ?? null,
      billing_status: ctx.bar.billing_status ?? null,
      trial_end_at: ctx.bar.trial_end_at ?? null,
    },
    stations,
  };
};

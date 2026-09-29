// settings.get — entrega-2-contratos.md §5. Read-only, no billing gate.
// Allowed for whoever can charge (payments needs the ticket data and the
// methods) or edit settings. The client cannot read WineBar directly, so this
// hands back the fields it needs from `ctx.bar`.
import { hasPermission, httpError, type Ctx, type Route } from '../_guard.ts';
import { settingsView } from './_shared.ts';

export const get: Route = async (ctx: Ctx) => {
  if (!ctx.bar) httpError(404, 'not_found', 'No se encontró el bar');
  const allowed = (await hasPermission(ctx, 'Cobro:cobrar')) || (await hasPermission(ctx, 'Ajustes:editar'));
  if (!allowed) httpError(403, 'forbidden', 'No tienes permiso para esta acción');
  return { bar: settingsView(ctx.bar, ctx.self?.id) };
};

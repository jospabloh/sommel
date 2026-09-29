// settings.update — entrega-2-contratos.md §5. Order: loadOwned ->
// permission -> requireWritable -> validate -> write with svc.
import { requirePermission, requireWritable, httpError, HttpError, type Ctx, type Route } from '../_guard.ts';
import { LogicError, buildSettingsPatch } from './_logic.ts';
import { effectiveMethods, settingsView } from './_shared.ts';

export const update: Route = async (ctx: Ctx, body: any) => {
  if (!ctx.tenantId) httpError(404, 'not_found', 'No se encontró el bar');
  // WineBar has no tenant_id (it IS the tenant), so loadOwned would always
  // 404 for a non-platform caller. requireContext already loaded the caller's
  // own bar as service role.
  if (!ctx.bar || ctx.bar.id !== ctx.tenantId) httpError(404, 'not_found', 'No se encontró el bar');
  const bar = ctx.bar;

  await requirePermission(ctx, 'Ajustes:editar');
  requireWritable(ctx);

  let patch: Record<string, unknown>;
  try {
    patch = buildSettingsPatch(body ?? {}, effectiveMethods(bar));
  } catch (err) {
    if (err instanceof LogicError) throw new HttpError(400, err.code, err.message);
    throw err;
  }

  await ctx.svc.entities.WineBar.update(bar.id, patch);
  const [fresh] = await ctx.svc.entities.WineBar.filter({ id: bar.id });
  return { bar: settingsView(fresh ?? { ...bar, ...patch }, ctx.self?.id) };
};

// account.exportData: the whole business as one JSON payload. NO billing gate,
// on purpose: it is read-only and a suspended bar getting its data out is
// exactly the case the export exists for (gating it would make the danger zone
// a trap). Order: permission -> read. The tenant is ctx.tenantId, re-derived
// from the caller's stored User row, never the body.
import { hasPermission, httpError, requirePermission, type Ctx, type Route } from '../_guard.ts';
import { EXPORT_ENTITIES, EXPORT_ROW_LIMIT, buildExportPayload, exportableBar, redactExportCosts } from './_logic.ts';

export const exportData: Route = async (ctx: Ctx) => {
  if (!ctx.tenantId || !ctx.bar) httpError(404, 'not_found', 'No se encontró el bar');
  await requirePermission(ctx, 'Ajustes:exportar');

  const tables: Record<string, unknown[]> = {};
  const errors: Array<{ entity: string; message: string }> = [];
  const truncated: string[] = [];
  const entities = ctx.svc.entities as Record<string, any>;

  // One failing entity never fails the export: it comes back empty plus an
  // entry in `errors`, and the UI warns instead of claiming a clean export.
  for (const name of EXPORT_ENTITIES) {
    try {
      const rows = await entities[name].filter({ tenant_id: ctx.tenantId }, 'created_date', EXPORT_ROW_LIMIT);
      tables[name] = Array.isArray(rows) ? rows : [];
      if (tables[name].length >= EXPORT_ROW_LIMIT) truncated.push(name);
    } catch (err) {
      tables[name] = [];
      errors.push({ entity: name, message: err instanceof Error ? err.message : 'error' });
    }
  }

  // Export permission is not cost permission: costs need Menú:ver_costos too.
  const canSeeCosts = await hasPermission(ctx, 'Menú:ver_costos');

  return buildExportPayload({
    bar: exportableBar(ctx.bar),
    tables: redactExportCosts(tables, canSeeCosts),
    costsRedacted: !canSeeCosts,
    errors,
    truncated,
    nowIso: new Date().toISOString(),
  });
};

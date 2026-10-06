// security.listAlerts / security.markSeen.
import { httpError, type Ctx, type Route } from '../_guard.ts';
import { isExpired, purgeExpired } from '../_security.ts';
import { alertView, requireSecurityViewer } from './_shared.ts';

const LIST_LIMIT = 200;
const MARK_LIMIT = 200;

export const listAlerts: Route = async (ctx: Ctx) => {
  const tenantId = await requireSecurityViewer(ctx);
  const nowMs = Date.now();
  await purgeExpired(ctx.svc, 'SecurityAlert', tenantId, nowMs);
  const rows = await ctx.svc.entities.SecurityAlert.filter({ tenant_id: tenantId }, '-created_at', LIST_LIMIT);
  const alerts = rows.filter((r: any) => !isExpired(r, nowMs)).map(alertView);
  return { alerts, unseen: alerts.filter((a: any) => !a.seen_at).length };
};

/** Marks the given alerts seen, or every unseen one with `all: true`. */
export const markSeen: Route = async (ctx: Ctx, body: any) => {
  const tenantId = await requireSecurityViewer(ctx);
  const ids: string[] | null = Array.isArray(body?.ids) ? body.ids.filter((x: unknown) => typeof x === 'string') : null;
  if (!body?.all && (!ids || ids.length === 0)) httpError(400, 'invalid_ids', 'Indica qué alertas marcar');
  const rows = await ctx.svc.entities.SecurityAlert.filter({ tenant_id: tenantId, seen_at: null }, '-created_at', MARK_LIMIT);
  // Only rows of THIS bar: an id from another bar is simply not in the list.
  const targets = rows.filter((r: any) => !r.seen_at && (body?.all || ids!.includes(r.id)));
  const seenAt = new Date().toISOString();
  const seenBy = ctx.user?.email ?? ctx.user?.id ?? null;
  let marked = 0;
  for (const r of targets) {
    await ctx.svc.entities.SecurityAlert.update(r.id, { seen_at: seenAt, seen_by: seenBy });
    marked++;
  }
  return { marked };
};

// security.listPhotos / security.getPhoto. The list never carries images (a
// month of photos would be megabytes); the admin opens one at a time.
import { loadOwned, type Ctx, type Route } from '../_guard.ts';
import { isExpired, purgeExpired } from '../_security.ts';
import { photoMeta, requireSecurityViewer } from './_shared.ts';

const LIST_LIMIT = 300;

export const listPhotos: Route = async (ctx: Ctx, body: any) => {
  const tenantId = await requireSecurityViewer(ctx);
  const nowMs = Date.now();
  await purgeExpired(ctx.svc, 'PhotoCheck', tenantId, nowMs);
  const query: Record<string, unknown> = { tenant_id: tenantId };
  if (typeof body?.user_id === 'string' && body.user_id) query.user_id = body.user_id;
  const rows = await ctx.svc.entities.PhotoCheck.filter(query, '-taken_at', LIST_LIMIT);
  return { photos: rows.filter((r: any) => !isExpired(r, nowMs)).map(photoMeta) };
};

export const getPhoto: Route = async (ctx: Ctx, body: any) => {
  await requireSecurityViewer(ctx);
  // loadOwned: another bar's photo and a missing one answer the same 404.
  const row = await loadOwned(ctx, 'PhotoCheck', typeof body?.id === 'string' ? body.id : '');
  if (isExpired(row, Date.now())) return { photo: null };
  return { photo: { ...photoMeta(row), image: row.image } };
};

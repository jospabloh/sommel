import { httpError, requirePermission, type Ctx } from '../_guard.ts';

/** Every action here: a member of a bar with Seguridad:ver. */
export async function requireSecurityViewer(ctx: Ctx): Promise<string> {
  await requirePermission(ctx, 'Seguridad:ver');
  if (!ctx.tenantId) httpError(403, 'no_tenant', 'No perteneces a ningún bar');
  return ctx.tenantId as string;
}

/** What the admin sees of a photo row in a list: never the image itself. */
export function photoMeta(row: any) {
  return {
    id: row.id,
    user_id: row.user_id,
    user_name: row.user_name ?? '',
    kind: row.kind,
    terminal_name: row.terminal_name ?? null,
    taken_at: row.taken_at,
    expires_at: row.expires_at,
  };
}

export function alertView(row: any) {
  return {
    id: row.id,
    user_id: row.user_id,
    user_name: row.user_name ?? '',
    kind: row.kind,
    detail: row.detail ?? '',
    photo_id: row.photo_id ?? null,
    created_at: row.created_at,
    seen_at: row.seen_at ?? null,
  };
}

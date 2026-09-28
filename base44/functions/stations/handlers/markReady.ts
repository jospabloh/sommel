// stations.markReady — entrega-1-contratos.md §4 "stations". Every
// requested item is loaded with `loadOwned` first (tenant check per item, so
// a batch can't smuggle in another bar's row), THEN permission and billing
// are checked once for the whole batch (contract §2's order still holds —
// `loadOwned` before `requirePermission`/`requireWritable` — it just runs
// once per item instead of once per action). `enviado` -> `listo`,
// `ready_at` = now. Idempotent: an item already `listo` is returned as-is,
// with no re-write and its original `ready_at` kept; an item in a status
// that can never reach `listo` from here (`nuevo`, `entregado`, `cancelado`)
// is skipped rather than failing the whole batch.
import { loadOwned, requirePermission, requireWritable, hasPermission, redactItemCosts, type Ctx, type Route, HttpError } from '../_guard.ts';
import { LogicError, validateItemIds, canMarkReady, isAlreadyReady } from './_logic.ts';

export const markReady: Route = async (ctx: Ctx, body: any) => {
  let ids: string[];
  try {
    ids = validateItemIds(body?.item_ids);
  } catch (err) {
    if (err instanceof LogicError) throw new HttpError(400, err.code, err.message);
    throw err;
  }

  const items: any[] = [];
  for (const id of ids) {
    items.push(await loadOwned(ctx, 'OrderItem', id));
  }

  await requirePermission(ctx, 'Estaciones:operar');
  requireWritable(ctx);

  const now = new Date().toISOString();
  const result: any[] = [];
  for (const item of items) {
    const status = item.status;
    if (!canMarkReady(status)) continue;
    if (isAlreadyReady(status)) {
      result.push(item);
      continue;
    }
    const updated = await ctx.svc.entities.OrderItem.update(item.id, { status: 'listo', ready_at: now });
    result.push(updated);
  }

  const canSeeCosts = await hasPermission(ctx, 'Menú:ver_costos');
  return { items: redactItemCosts(result, canSeeCosts) };
};

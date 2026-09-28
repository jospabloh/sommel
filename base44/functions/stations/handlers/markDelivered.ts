// stations.markDelivered — entrega-1-contratos.md §4 "stations". Same shape
// as markReady.ts: every item loaded with `loadOwned` first (tenant check
// per item), permission/billing checked once for the batch. `listo` ->
// `entregado`. Idempotent: an item already `entregado` is returned as-is
// with no re-write; an item that hasn't reached `listo` yet (`nuevo`,
// `enviado`) or is `cancelado` is skipped rather than failing the batch.
import { loadOwned, requirePermission, requireWritable, type Ctx, type Route, HttpError } from '../_guard.ts';
import { LogicError, validateItemIds, canMarkDelivered, isAlreadyDelivered } from './_logic.ts';

export const markDelivered: Route = async (ctx: Ctx, body: any) => {
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

  const result: any[] = [];
  for (const item of items) {
    const status = item.data?.status;
    if (!canMarkDelivered(status)) continue;
    if (isAlreadyDelivered(status)) {
      result.push(item);
      continue;
    }
    const updated = await ctx.svc.entities.OrderItem.update(item.id, { status: 'entregado' });
    result.push(updated);
  }

  return { items: result };
};

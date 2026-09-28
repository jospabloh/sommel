// stations.undoReady — entrega-1-contratos.md §4 "stations". Single item
// (not a batch — "toque equivocado" on one line). `listo` -> `enviado`, only
// within 5 minutes of `ready_at` (UNDO_WINDOW_MS in ./_logic.ts). Clears
// `ready_at` on the way back so a stale timestamp can't make a later
// re-mark-ready look instantly overdue.
import { loadOwned, requirePermission, requireWritable, hasPermission, httpError, redactItemCost, type Ctx, type Route, HttpError } from '../_guard.ts';
import { LogicError, validateItemId, canUndoReady, isWithinUndoWindow } from './_logic.ts';

export const undoReady: Route = async (ctx: Ctx, body: any) => {
  let id: string;
  try {
    id = validateItemId(body?.item_id);
  } catch (err) {
    if (err instanceof LogicError) throw new HttpError(400, err.code, err.message);
    throw err;
  }

  const item = await loadOwned(ctx, 'OrderItem', id);

  await requirePermission(ctx, 'Estaciones:operar');
  requireWritable(ctx);

  if (!canUndoReady(item.status)) {
    httpError(409, 'invalid_status', 'Solo se puede deshacer un renglón marcado listo');
  }

  if (!isWithinUndoWindow(item.ready_at, new Date())) {
    httpError(409, 'too_late', 'Ya pasaron más de 5 minutos desde que se marcó listo');
  }

  const updated = await ctx.svc.entities.OrderItem.update(item.id, { status: 'enviado', ready_at: null });

  const canSeeCosts = await hasPermission(ctx, 'Menú:ver_costos');
  return { item: redactItemCost(updated, canSeeCosts) };
};

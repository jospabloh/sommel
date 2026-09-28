// payments.splitPreview — entrega-2-contratos.md §5. Writes nothing.
import { loadOwned, requirePermission, httpError, splitEqual, type Ctx, type Route } from '../_guard.ts';
import { remainingOf, splitByItems, validateParts } from './_logic.ts';
import { loadItems, loadPayments, rethrow } from './_shared.ts';

export const splitPreview: Route = async (ctx: Ctx, body: any) => {
  const order = await loadOwned(ctx, 'Order', body?.order_id);
  await requirePermission(ctx, 'Cobro:cobrar');

  const payments = await loadPayments(ctx, order.id);
  const remaining = remainingOf(order.total ?? 0, payments);

  try {
    if (body?.mode === 'equal') {
      const parts = validateParts(body?.parts);
      return { amounts: splitEqual(remaining, parts) };
    }
    if (body?.mode === 'items') {
      const items = await loadItems(ctx, order.id);
      const amount = splitByItems(
        items,
        body?.item_ids,
        { subtotal: order.subtotal ?? 0, total: order.total ?? 0 },
        remaining
      );
      return { amount };
    }
  } catch (err) {
    rethrow(err);
  }
  return httpError(400, 'invalid_mode', 'Modo de división no válido');
};

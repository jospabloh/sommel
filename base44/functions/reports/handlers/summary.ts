// reports.summary — entrega-2-contratos.md §5 "reports".
// Order of checks: auth (handle) -> permission -> validation -> reads. No
// requireWritable: this is a read. Everything is scoped by ctx.tenantId.
import {
  requirePermission,
  hasPermission,
  httpError,
  localDayRange,
  BAR_UTC_OFFSET_MIN,
  personName,
  type Ctx,
  type Route,
} from '../_guard.ts';
import { aggregate, resolveRange } from './_logic.ts';
import { fetchAll, fetchByIds, fetchRanged, guardLogic } from './_shared.ts';

export const summary: Route = async (ctx: Ctx, body: any) => {
  await requirePermission(ctx, 'Reportes:ver');
  const tenantId = ctx.tenantId;
  if (!tenantId) httpError(403, 'no_tenant', 'No perteneces a ningún bar');

  const range = guardLogic(() => resolveRange(body?.from, body?.to));
  // localDayRange throws HttpError(400) on a bad date; resolveRange already
  // validated both, so these only compute the UTC window of each local day.
  const fromISO = localDayRange(range.from).fromISO;
  const toISO = localDayRange(range.to).toISO;
  const previousFromISO = localDayRange(range.previous_from).fromISO;
  const previousToISO = localDayRange(range.previous_to).toISO;

  const [canSeeCosts, canSeeCorte] = await Promise.all([
    hasPermission(ctx, 'Menú:ver_costos'),
    hasPermission(ctx, 'Turno:ver_corte'),
  ]);

  const svc = ctx.svc.entities;
  const scope = { tenant_id: tenantId };

  // Orders of both periods in one read; aggregate() splits them.
  const orders = await fetchRanged(
    svc.Order,
    { ...scope, status: 'cobrada' },
    { closed_at: { $gte: previousFromISO, $lt: toISO } }
  );
  const currentOrderIds = orders
    .filter((o: any) => {
      const t = Date.parse(o.closed_at);
      return t >= Date.parse(fromISO) && t < Date.parse(toISO);
    })
    .map((o: any) => o.id);

  const [items, payments, cancelledItems, wasteMovements, shifts, products, categories, inventoryItems, users] =
    await Promise.all([
      fetchByIds(svc.OrderItem, scope, 'order_id', orders.map((o: any) => o.id)),
      fetchByIds(svc.Payment, scope, 'order_id', currentOrderIds),
      fetchRanged(
        svc.OrderItem,
        { ...scope, status: 'cancelado' },
        { updated_date: { $gte: fromISO, $lt: toISO } }
      ),
      fetchRanged(
        svc.InventoryMovement,
        { ...scope, type: 'merma' },
        { created_date: { $gte: fromISO, $lt: toISO } }
      ),
      canSeeCorte
        ? fetchRanged(svc.Shift, scope, { closed_at: { $gte: fromISO, $lt: toISO } })
        : Promise.resolve([]),
      fetchAll(svc.Product, scope),
      fetchAll(svc.Category, scope),
      fetchAll(svc.InventoryItem, scope),
      fetchAll(svc.User, scope),
    ]);

  const people: Record<string, string> = {};
  for (const u of users) {
    if (u.email) people[u.email] = personName(u);
  }

  const result = aggregate({
    fromISO,
    toISO,
    previousFromISO,
    previousToISO,
    offsetMin: BAR_UTC_OFFSET_MIN,
    orders,
    items,
    payments,
    cancelledItems,
    products,
    categories,
    wasteMovements,
    inventoryItems,
    shifts,
    people,
    includeCosts: canSeeCosts,
    includeCashDifferences: canSeeCorte,
  });

  return {
    range: { from: range.from, to: range.to, days: range.days },
    previous_range: { from: range.previous_from, to: range.previous_to, days: range.days },
    ...result,
  };
};

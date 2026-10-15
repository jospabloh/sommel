// orders.addItems — entrega-1-contratos.md §4 "orders".
import { loadOwned, requirePermission, requireWritable, hasPermission, pickSurvivor, httpError, HttpError, redactItemCosts, type Ctx, type Route } from '../_guard.ts';
import { LogicError, validateBatchKey, batchLineKeys, addLinesIdempotent, narrowByField, resolveItemPricing, resolveExtras, withExtras, validateQty, isOrderOpen, needsQtyConfirm, qtyConfirmThreshold } from './_logic.ts';
import { recomputeOrderTotals } from './_shared.ts';

export const addItems: Route = async (ctx: Ctx, body: any) => {
  const order = await loadOwned(ctx, 'Order', body?.order_id);

  await requirePermission(ctx, 'Comandas:tomar');
  requireWritable(ctx);
  // D7: created rows include unit_cost (frozen above) — redact before the
  // response leaves the server unless the caller has Menú:ver_costos.
  const canSeeCosts = await hasPermission(ctx, 'Menú:ver_costos');

  if (!isOrderOpen(order.status)) {
    httpError(409, 'order_closed', 'Esta comanda ya no está abierta');
  }

  const items = Array.isArray(body?.items) ? body.items : [];
  if (items.length === 0) {
    httpError(400, 'items_required', 'Debes agregar al menos un renglón');
  }

  // One key per attempt (and per line): a replay after a 429 that did land
  // answers with the stored lines instead of creating them again. A client
  // without batch_key keeps the old behavior.
  let batchKey: string | null;
  try {
    batchKey = validateBatchKey(body?.batch_key);
  } catch (err) {
    if (err instanceof LogicError) throw new HttpError(400, err.code, err.message);
    throw err;
  }
  const keys = batchKey ? batchLineKeys(batchKey, items.length) : null;
  const findByKeys = async (wanted: string[]): Promise<any[]> => {
    const rows: any[] = [];
    for (let i = 0; i < wanted.length; i += 100) {
      const part = wanted.slice(i, i + 100);
      try {
        rows.push(...narrowByField(await ctx.svc.entities.OrderItem.filter({ order_id: order.id, idempotency_key: { $in: part } }), 'idempotency_key', part));
      } catch {
        for (const key of part) {
          rows.push(...narrowByField(await ctx.svc.entities.OrderItem.filter({ order_id: order.id, idempotency_key: key }), 'idempotency_key', [key]));
        }
      }
    }
    return rows.filter((r) => r.order_id === order.id);
  };
  // Replay: every line is already stored, so skip the qty prompt and the
  // product reads and answer exactly as the first time.
  if (keys) {
    const stored = await findByKeys(keys);
    const have = new Set(stored.map((r: any) => r.idempotency_key));
    if (keys.every((k) => have.has(k))) {
      const rows = keys.map((k) => pickSurvivor(stored.filter((r: any) => r.idempotency_key === k)));
      await recomputeOrderTotals(ctx, order.id);
      return { items: redactItemCosts(rows, canSeeCosts), idempotent: true };
    }
  }

  // A big quantity asks first (Ajustes, qty_confirm_threshold): checked before
  // any product is read, so the "¿Seguro?" round trip costs no entity reads.
  const threshold = qtyConfirmThreshold(ctx.bar);
  const big = items.map((raw: any) => raw?.qty).filter((q: unknown) => needsQtyConfirm(q, threshold, 0, body?.confirm_qty === true));
  if (big.length > 0) {
    throw new HttpError(409, 'qty_confirm_required', `¿Seguro? Son ${Math.max(...big)} piezas.`, { qty: Math.max(...big), threshold });
  }

  // Resolve every line against the STORED Product before writing anything —
  // one bad line fails the whole call instead of leaving a partial add.
  // The tenant's extras are read ONCE per call, and only when some line asks
  // for one (Base44's app-wide rate limit is tight). The tenant comes from the
  // STORED order, never the body.
  const wantsExtras = items.some((raw: any) => raw?.extras != null && !(Array.isArray(raw.extras) && raw.extras.length === 0));
  const extrasCatalog: any[] = wantsExtras
    ? await ctx.svc.entities.MenuExtra.filter({ tenant_id: order.tenant_id })
    : [];

  const resolved: any[] = [];
  for (const raw of items) {
    if (!raw?.product_id) httpError(400, 'product_required', 'Cada renglón necesita un producto');
    const product = await loadOwned(ctx, 'Product', raw.product_id);
    try {
      const qty = validateQty(raw.qty);
      const base = resolveItemPricing(product, { variant: raw.variant, modifiers: raw.modifiers });
      // unit_price = base + extras; unit_cost stays the base cost.
      const pricing = withExtras(base, resolveExtras(extrasCatalog, raw.product_id, raw.extras, order.tenant_id));
      resolved.push({
        product_id: raw.product_id,
        qty,
        notes: typeof raw.notes === 'string' ? raw.notes : '',
        ...pricing,
      });
    } catch (err) {
      if (err instanceof LogicError) throw new HttpError(400, err.code, err.message);
      throw err;
    }
  }

  const { rows: createdItems, idempotent } = await addLinesIdempotent({
    keys,
    lines: resolved,
    find: findByKeys,
    pick: pickSurvivor,
    neutralize: async (row) => {
      await ctx.svc.entities.OrderItem.update(row.id, { status: 'cancelado', cancel_reason: 'duplicado', cancelled_by: 'sistema', prepared: false });
    },
    create: (line, key) => ctx.svc.entities.OrderItem.create({
      // Fixed 2026-09-28: tenant_id must come from the STORED order, not
      // ctx.tenantId — a platform caller has no tenant of their own
      // (ctx.tenantId is null), so writing ctx.tenantId here created
      // OrderItems with tenant_id null when a platform admin added a line to
      // a tenant's order: invisible to that bar's own staff under RLS, while
      // still counted in the order's own totals (recomputeOrderTotals reads
      // by order_id, not tenant_id).
      tenant_id: order.tenant_id,
      order_id: order.id,
      product_id: line.product_id,
      variant: line.variant,
      variant_label: line.variant_label,
      name: line.name,
      unit_price: line.unit_price,
      // Omitted (not null) when the cost is not captured yet: absent reads
      // back as "sin capturar" and needs no nullable schema on the live app.
      ...(line.unit_cost == null ? {} : { unit_cost: line.unit_cost }),
      qty: line.qty,
      modifiers: line.modifiers,
      extras: line.extras,
      notes: line.notes,
      station: line.station,
      status: 'nuevo',
      prepared: false,
      created_by: ctx.user.email,
      ...(key ? { idempotency_key: key } : {}),
    }),
  });

  await recomputeOrderTotals(ctx, order.id);

  return { items: redactItemCosts(createdItems, canSeeCosts), ...(idempotent ? { idempotent: true } : {}) };
};

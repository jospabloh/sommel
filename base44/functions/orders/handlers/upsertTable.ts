// orders.upsertTable — entrega-1-contratos.md §4 "orders".
import { LogicError, validateTableFields } from './_logic.ts';
import { loadOwned, requirePermission, requireWritable, httpError, HttpError, type Ctx, type Route } from '../_guard.ts';

export const upsertTable: Route = async (ctx: Ctx, body: any) => {
  const id = body?.id;
  let existing: any = null;
  if (id) existing = await loadOwned(ctx, 'BarTable', id);

  await requirePermission(ctx, 'Mesas:editar');
  requireWritable(ctx);

  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) httpError(400, 'name_required', 'El nombre de la mesa es obligatorio');

  let fields: Record<string, unknown>;
  try {
    // zone '' clears the zone; an absent key keeps it.
    fields = { name, ...validateTableFields(body) };
  } catch (err) {
    if (err instanceof LogicError) throw new HttpError(400, err.code, err.message);
    throw err;
  }

  let table;
  if (existing) {
    table = await ctx.svc.entities.BarTable.update(existing.id, fields);
  } else {
    table = await ctx.svc.entities.BarTable.create({
      tenant_id: ctx.tenantId,
      status: 'available',
      ...fields,
    });
  }

  return { table };
};

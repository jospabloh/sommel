// orders.upsertTable — entrega-1-contratos.md §4 "orders".
import { loadOwned, requirePermission, requireWritable, httpError, type Ctx, type Route } from '../_guard.ts';

export const upsertTable: Route = async (ctx: Ctx, body: any) => {
  const id = body?.id;
  let existing: any = null;
  if (id) existing = await loadOwned(ctx, 'BarTable', id);

  await requirePermission(ctx, 'Mesas:editar');
  requireWritable(ctx);

  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) httpError(400, 'name_required', 'El nombre de la mesa es obligatorio');

  const fields: Record<string, unknown> = { name };
  if (body?.seats !== undefined) fields.seats = body.seats;
  if (body?.zone !== undefined) fields.zone = body.zone;
  if (body?.x !== undefined) fields.x = body.x;
  if (body?.y !== undefined) fields.y = body.y;

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

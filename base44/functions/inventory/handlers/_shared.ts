// Impure helpers shared by the `inventory` handlers. Kept apart from
// `_logic.ts`, which must stay import-free for `deno test`.
import { pickSurvivor, httpError, HttpError, type Ctx } from '../_guard.ts';
import { computeStock, LogicError, round3 } from './_logic.ts';

/** Runs pure logic and maps its LogicError to a 400 HttpError. */
export function guardLogic<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof LogicError) throw new HttpError(400, err.code, err.message);
    throw err;
  }
}

/** Reads every row for a query (Base44 caps a single filter page). */
export async function fetchAll(client: any, query: Record<string, unknown>): Promise<any[]> {
  const PAGE = 500;
  const out: any[] = [];
  for (let skip = 0; skip < 50_000; skip += PAGE) {
    const rows = await client.filter(query, 'created_date', PAGE, skip);
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

/** Recomputes InventoryItem.stock as Σ qty of its movements and writes it back. */
export async function recomputeStock(ctx: Ctx, item: any): Promise<any> {
  const movements = await fetchAll(ctx.svc.entities.InventoryMovement, {
    tenant_id: item.tenant_id,
    item_id: item.id,
  });
  const stock = computeStock(movements);
  await ctx.svc.entities.InventoryItem.update(item.id, { stock });
  const [fresh] = await ctx.svc.entities.InventoryItem.filter({ id: item.id });
  return fresh ?? { ...item, stock };
}

/** Current stock straight from the movements (never the cached column). */
export async function currentStock(ctx: Ctx, item: any): Promise<number> {
  const movements = await fetchAll(ctx.svc.entities.InventoryMovement, {
    tenant_id: item.tenant_id,
    item_id: item.id,
  });
  return computeStock(movements);
}

export interface MovementInput {
  type: 'entrada' | 'merma' | 'conteo';
  idempotency_key: string;
  reason: string;
  unit_cost: number | null;
  // Either a fixed qty or a function of the current stock (counts).
  qty: number | ((stock: number) => number);
}

/**
 * Idempotent movement write (contract §1): look up by key, create if absent,
 * re-read, and if a concurrent call left more than one row keep the oldest
 * (`pickSurvivor`) and neutralize the rest (`qty: 0`, `reason: 'duplicado'`),
 * never deleting. Stock is then recomputed as Σ qty, so it converges even
 * when two writes cross. A replay returns the original movement untouched.
 */
export async function recordMovement(ctx: Ctx, item: any, input: MovementInput): Promise<{ movement: any; item: any; created: boolean }> {
  const client = ctx.svc.entities.InventoryMovement;
  const keyQuery = { tenant_id: item.tenant_id, idempotency_key: input.idempotency_key };

  const existing = pickSurvivor(await client.filter(keyQuery));
  if (existing) {
    if (existing.item_id !== item.id) {
      httpError(409, 'idempotency_conflict', 'Esa llave ya se usó en otro insumo');
    }
    return { movement: existing, item: await recomputeStock(ctx, item), created: false };
  }

  const qty = typeof input.qty === 'function' ? input.qty(await currentStock(ctx, item)) : input.qty;
  const made = await client.create({
    tenant_id: item.tenant_id,
    item_id: item.id,
    type: input.type,
    qty: round3(qty),
    unit_cost: input.unit_cost,
    reason: input.reason,
    idempotency_key: input.idempotency_key,
    created_by: ctx.user.email,
  });

  const rows = await client.filter(keyQuery);
  const survivor = pickSurvivor(rows);
  for (const row of rows) {
    if (survivor && row.id !== survivor.id) {
      await client.update(row.id, { qty: 0, reason: 'duplicado' });
    }
  }
  return { movement: survivor, item: await recomputeStock(ctx, item), created: !!survivor && survivor.id === made?.id };
}

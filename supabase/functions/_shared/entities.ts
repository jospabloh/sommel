// The `entities` shim (docs/migracion-supabase.md §3.3): the Base44 SDK's
// `entities.<Name>.filter/list/get/create/update/delete`, over a supabase-js
// client created with the service key. The handlers move to Supabase without
// changing; the decisions live in `entities_logic.ts`.
//
// It takes the client as an argument (no supabase-js import here), so the
// tests drive it with a fake that records the calls.

import {
  COST_TABLE,
  ENTITY_TABLE,
  ShimError,
  fromRow,
  idColumn,
  isUniqueViolation,
  isUuid,
  NATURAL_KEYS,
  naturalKeyFilter,
  planFilter,
  planRange,
  planSort,
  planWrite,
  selectFor,
  tableOf,
  type FilterPlan,
} from './entities_logic.ts';

// The part of supabase-js the shim uses. Every builder method returns the
// builder; awaiting it yields `{ data, error }`.
// deno-lint-ignore no-explicit-any
export type QueryBuilder = any;
export type SupabaseLike = {
  from(table: string): QueryBuilder;
  auth?: { admin?: { deleteUser(id: string): Promise<{ error: unknown }> } };
};

type Row = Record<string, unknown>;

export type EntityApi = {
  filter(query?: Row, sort?: string | null, limit?: number | null, skip?: number | null): Promise<Row[]>;
  list(sort?: string | null, limit?: number | null, skip?: number | null): Promise<Row[]>;
  get(id: string): Promise<Row>;
  create(data: Row): Promise<Row>;
  update(id: string, data: Row): Promise<Row>;
  delete(id: string): Promise<void>;
};

function fail(table: string, op: string, error: unknown): never {
  const e = error as { message?: string; code?: string; status?: number } | null;
  const err = new ShimError(e?.status && e.status >= 400 ? e.status : 500, e?.code ?? 'db_error', `${table}.${op}: ${e?.message ?? 'error'}`);
  throw err;
}

const notFound = (table: string) => new ShimError(404, 'not_found', `${table}: not found`);

function applyFilter(q: QueryBuilder, plan: FilterPlan): QueryBuilder {
  for (const op of plan.ops) {
    if (op.kind === 'eq') q = q.eq(op.column, op.value);
    else if (op.kind === 'in') q = q.in(op.column, op.values);
    else if (op.kind === 'gte') q = q.gte(op.column, op.value);
    else if (op.kind === 'lt') q = q.lt(op.column, op.value);
    else q = q.is(op.column, null);
  }
  return q;
}

export function entityApi(client: SupabaseLike, entity: string): EntityApi {
  const table = tableOf(entity);
  const idCol = idColumn(table);
  const cost = COST_TABLE[table];

  async function filter(query: Row = {}, sort?: string | null, limit?: number | null, skip?: number | null) {
    const plan = planFilter(table, query);
    const order = planSort(table, sort);
    const range = planRange(limit, skip);
    if (plan.empty) return [];
    let q = applyFilter(client.from(table).select(selectFor(table)), plan);
    if (order) q = q.order(order.column, { ascending: order.ascending });
    if (range) q = q.range(range[0], range[1]);
    const { data, error } = await q;
    if (error) fail(table, 'filter', error);
    return ((data ?? []) as Row[]).map((r) => fromRow(table, r) as Row);
  }

  async function writeCost(id: string, tenantId: unknown, value: unknown) {
    if (!cost) return;
    const { error } = await client
      .from(cost[0])
      .upsert({ [cost[1]]: id, tenant_id: tenantId, unit_cost: value }, { onConflict: cost[1] });
    if (error) fail(cost[0], 'upsert', error);
  }

  async function create(data: Row) {
    const { row, unitCost } = planWrite(table, data, 'create');
    const { data: created, error } = await client.from(table).insert(row).select(selectFor(table)).single();
    if (error) {
      const key = isUniqueViolation(error) ? naturalKeyFilter(table, row) : null;
      if (!key) fail(table, 'create', error);
      const [existing] = await filter(key, 'created_date', 1);
      if (!existing) fail(table, 'create', error);
      if (NATURAL_KEYS[table].onConflict === 'update') return await update(existing.id as string, data);
      return existing;
    }
    const out = fromRow(table, created as Row) as Row;
    if (unitCost.present) {
      await writeCost(out[idCol] as string, out.tenant_id, unitCost.value);
      out.unit_cost = unitCost.value;
    }
    return out;
  }

  async function update(id: string, data: Row) {
    if (!isUuid(id)) throw notFound(table);
    const { row, unitCost } = planWrite(table, data, 'update');
    let out: Row | null;
    if (Object.keys(row).length === 0) {
      const { data: found, error } = await client.from(table).select(selectFor(table)).eq(idCol, id).maybeSingle();
      if (error) fail(table, 'update', error);
      out = fromRow(table, found as Row | null);
    } else {
      const { data: updated, error } = await client.from(table).update(row).eq(idCol, id).select(selectFor(table)).maybeSingle();
      if (error) fail(table, 'update', error);
      out = fromRow(table, updated as Row | null);
    }
    if (!out) throw notFound(table);
    if (unitCost.present) {
      await writeCost(id, out.tenant_id, unitCost.value);
      out.unit_cost = unitCost.value;
    }
    return out;
  }

  async function get(id: string) {
    const [row] = isUuid(id) ? await filter({ [table === 'profile' ? 'id' : idCol]: id }, null, 1) : [];
    if (!row) throw notFound(table);
    return row;
  }

  async function remove(id: string) {
    if (!isUuid(id)) throw notFound(table);
    if (table === 'profile') {
      // A User is the auth account; profile cascades from auth.users (D8).
      const admin = client.auth?.admin;
      if (!admin) throw new ShimError(500, 'no_auth_admin', 'profile.delete needs the auth admin API');
      const { error } = await admin.deleteUser(id);
      if (error) fail(table, 'delete', error);
      return;
    }
    const { error } = await client.from(table).delete().eq(idCol, id);
    if (error) fail(table, 'delete', error);
  }

  return {
    filter,
    list: (sort, limit, skip) => filter({}, sort, limit, skip),
    get,
    create,
    update,
    delete: remove,
  };
}

// `entities.<Name>` for every entity, built on first use.
export function createEntities(client: SupabaseLike): Record<string, EntityApi> {
  const cache = new Map<string, EntityApi>();
  return new Proxy({} as Record<string, EntityApi>, {
    get(_target, prop) {
      // Only real entity names: `then`, `toJSON` and the like stay undefined.
      if (typeof prop !== 'string' || !Object.hasOwn(ENTITY_TABLE, prop)) return undefined;
      if (!cache.has(prop)) cache.set(prop, entityApi(client, prop));
      return cache.get(prop);
    },
  });
}

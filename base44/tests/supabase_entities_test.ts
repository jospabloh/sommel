// The `entities` shim that lets the Base44 handlers run on Supabase
// (docs/migracion-supabase.md §3.3, phase 2). Driven with a fake supabase-js
// client that records every builder call, so no network is needed. Each test
// says what a handler would get wrong if the translation broke.
//   deno test --allow-env base44/tests/supabase_entities_test.ts
import { createEntities, type SupabaseLike } from '../../supabase/functions/_shared/entities.ts';
import {
  ENTITY_TABLE,
  planFilter,
  planRange,
  planWrite,
  fromRow,
  naturalKeyFilter,
} from '../../supabase/functions/_shared/entities_logic.ts';
import { COLUMN_TYPES } from '../../supabase/functions/_shared/schema.generated.ts';

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg ?? 'assertEquals'}\n  actual:   ${a}\n  expected: ${e}`);
}
async function assertRejects(fn: () => Promise<unknown>, status: number, msg: string) {
  try {
    await fn();
  } catch (e) {
    if ((e as { status?: number }).status !== status) throw new Error(`${msg}: status ${(e as { status?: number }).status}, wanted ${status}`);
    return;
  }
  throw new Error(`${msg}: did not throw`);
}

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const ROW = '33333333-3333-4333-8333-333333333333';

type Call = [string, ...unknown[]];
type Result = { data?: unknown; error?: unknown };

// Every `from()` starts a chain; awaiting the chain pops the next queued result.
function fakeClient(results: Result[] = []) {
  const chains: Call[][] = [];
  const deleted: string[] = [];
  const client: SupabaseLike = {
    from(table: string) {
      const calls: Call[] = [['from', table]];
      chains.push(calls);
      const builder: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'gte', 'lt', 'is', 'order', 'range', 'insert', 'update', 'upsert', 'delete', 'single', 'maybeSingle']) {
        builder[m] = (...args: unknown[]) => {
          calls.push([m, ...args]);
          return builder;
        };
      }
      builder.then = (resolve: (r: Result) => unknown) => resolve(results.shift() ?? { data: [], error: null });
      return builder;
    },
    auth: { admin: { deleteUser: (id: string) => (deleted.push(id), Promise.resolve({ error: null })) } },
  };
  return { client, chains, deleted };
}

Deno.test('every entity maps to a table the migrations create', () => {
  // A handler calling an entity whose table does not exist would 500 on Supabase.
  for (const [entity, table] of Object.entries(ENTITY_TABLE)) {
    if (!COLUMN_TYPES[table]) throw new Error(`${entity} -> ${table} has no table`);
  }
  assertEquals(Object.keys(ENTITY_TABLE).length, 27, 'the 27 Base44 entities');
});

Deno.test('filter translates equality, null, $in, $gte, $lt, sort and window', async () => {
  const { client, chains } = fakeClient([{ data: [{ id: ROW, tenant_id: A }], error: null }]);
  const e = createEntities(client);
  const rows = await e.Order.filter(
    { tenant_id: A, status: 'abierta', closed_at: null, table_ids: undefined, id: { $in: [ROW, 'not-a-uuid'] }, created_date: { $gte: '2026-10-01', $lt: '2026-10-02' } },
    '-created_date',
    50,
    100,
  );
  assertEquals(rows, [{ id: ROW, tenant_id: A }]);
  assertEquals(chains[0], [
    ['from', 'orders'],
    ['select', '*'],
    ['eq', 'tenant_id', A],
    ['eq', 'status', 'abierta'],
    ['is', 'closed_at', null],
    ['in', 'id', [ROW]],
    ['gte', 'created_date', '2026-10-01'],
    ['lt', 'created_date', '2026-10-02'],
    ['order', 'created_date', { ascending: false }],
    ['range', 100, 149],
  ]);
});

Deno.test('a uuid column compared with a non-uuid matches nothing, without a query', async () => {
  // Postgres would raise 22P02 and the handler would answer 500 instead of 404.
  const { client, chains } = fakeClient();
  const e = createEntities(client);
  assertEquals(await e.Order.filter({ tenant_id: A, id: '6705a1b2c3d4e5f6a7b8c9d0' }), []);
  assertEquals(await e.Order.filter({ id: { $in: ['x', ''] } }), []);
  assertEquals(chains.length, 0, 'no round trip');
  await assertRejects(() => e.Order.get('6705a1b2c3d4e5f6a7b8c9d0'), 404, 'get with a Base44 id');
  await assertRejects(() => e.Order.update('nope', { status: 'x' }), 404, 'update with a bad id');
});

Deno.test('unknown fields and operators fail loudly instead of matching everything', () => {
  // Silently ignoring a misspelt tenant_id filter would read every bar.
  for (const q of [{ tenat_id: A }, { status: { $ne: 'x' } }, { status: ['a', 'b'] }, { status: {} }]) {
    let threw = false;
    try {
      planFilter('orders', q as Record<string, unknown>);
    } catch {
      threw = true;
    }
    if (!threw) throw new Error(`accepted ${JSON.stringify(q)}`);
  }
});

Deno.test('window: limit, skip and both', () => {
  assertEquals(planRange(20), [0, 19]);
  assertEquals(planRange(20, 40), [40, 59]);
  assertEquals(planRange(undefined, 10), [10, 1009]);
  assertEquals(planRange(), null);
});

Deno.test('User is profile: id is user_id and role is is_platform', async () => {
  const { client, chains } = fakeClient([{ data: [{ user_id: A, email: 'a@x.mx', is_platform: false, tenant_id: B }], error: null }]);
  const e = createEntities(client);
  const [u] = await e.User.filter({ id: A, role: 'admin' });
  assertEquals(chains[0].slice(0, 4), [['from', 'profile'], ['select', '*'], ['eq', 'user_id', A], ['eq', 'is_platform', true]]);
  assertEquals([u.id, u.role, u.tenant_id], [A, 'user', B]);
});

Deno.test('writes: empty strings become null on non-text columns, unknown fields are dropped', () => {
  const plan = planWrite('print_job', { tenant_id: A, claimed_by: '', claimed_at: '', nope: 1, created_date: 'x', id: 'abc' }, 'create');
  assertEquals(plan.row, { tenant_id: A, claimed_by: '', claimed_at: null });
  assertEquals(plan.dropped, ['nope', 'created_date', 'id']);
  assertEquals(planWrite('orders', { id: ROW, tenant_id: A }, 'create').row, { id: ROW, tenant_id: A }, 'a uuid id is kept on create');
  assertEquals(planWrite('orders', { id: ROW, status: 'abierta' }, 'update').row, { status: 'abierta' }, 'never on update');
});

Deno.test('unit_cost is read from and written to the cost table, never the parent row', async () => {
  // order_item has no unit_cost column: it is in order_item_cost, out of reach of realtime.
  const { client, chains } = fakeClient([
    { data: { id: ROW, tenant_id: A, name: 'Tinto', order_item_cost: null }, error: null },
    { data: null, error: null },
  ]);
  const e = createEntities(client);
  const item = await e.OrderItem.create({ tenant_id: A, order_id: B, product_id: B, name: 'Tinto', unit_cost: 1200 });
  assertEquals(chains[0], [
    ['from', 'order_item'],
    ['insert', { tenant_id: A, order_id: B, product_id: B, name: 'Tinto' }],
    ['select', '*, order_item_cost(unit_cost)'],
    ['single'],
  ]);
  assertEquals(chains[1], [['from', 'order_item_cost'], ['upsert', { order_item_id: ROW, tenant_id: A, unit_cost: 1200 }, { onConflict: 'order_item_id' }]]);
  assertEquals(item.unit_cost, 1200);
  assertEquals(fromRow('order_item', { id: ROW, order_item_cost: [{ unit_cost: 900 }] }), { id: ROW, unit_cost: 900 }, 'embedded as a list');
  assertEquals(fromRow('order_item', { id: ROW, order_item_cost: null }), { id: ROW, unit_cost: null }, 'no cost row');
});

Deno.test('a create that hits an idempotency key returns the row already holding it', async () => {
  // Base44 code creates, re-reads and keeps the oldest; with a unique index the
  // second insert fails instead, and the handler must still see one row.
  const { client, chains } = fakeClient([
    { data: null, error: { code: '23505', message: 'duplicate key' } },
    { data: [{ id: ROW, tenant_id: A, idempotency_key: 'k1', amount: 500 }], error: null },
  ]);
  const e = createEntities(client);
  const p = await e.Payment.create({ tenant_id: A, order_id: B, amount: 500, idempotency_key: 'k1' });
  assertEquals(p.id, ROW);
  assertEquals(chains[1].slice(0, 4), [['from', 'payment'], ['select', '*'], ['eq', 'tenant_id', A], ['eq', 'idempotency_key', 'k1']]);
  assertEquals(naturalKeyFilter('attendance', { tenant_id: A, user_id: B }), { tenant_id: A, user_id: B, clock_out: null });
  assertEquals(naturalKeyFilter('payment', { tenant_id: A, idempotency_key: '' }), null, 'no key, no lookup');
  assertEquals(naturalKeyFilter('passkey', { tenant_id: A, credential_id: 'c' }), null, 'a duplicate passkey stays an error');
});

Deno.test('a create that hits an editable unique key applies its payload to the existing row', async () => {
  // Two first saves of the staff profile race: the loser must not report
  // overrides the database never stored (Codex review on #100).
  const { client, chains } = fakeClient([
    { data: null, error: { code: '23505', message: 'duplicate key' } },
    { data: [{ id: ROW, tenant_id: A, role: 'staff', overrides: { x: true } }], error: null },
    { data: { id: ROW, tenant_id: A, role: 'staff', overrides: { x: false } }, error: null },
  ]);
  const saved = await createEntities(client).PermissionProfile.create({ tenant_id: A, role: 'staff', overrides: { x: false } });
  assertEquals(saved.overrides, { x: false });
  assertEquals(chains[2].slice(0, 3), [['from', 'permission_profile'], ['update', { tenant_id: A, role: 'staff', overrides: { x: false } }], ['eq', 'id', ROW]]);
});

Deno.test('other database errors surface as errors', async () => {
  const { client } = fakeClient([{ data: null, error: { code: '23503', message: 'fk' } }]);
  await assertRejects(() => createEntities(client).Payment.create({ tenant_id: A, idempotency_key: 'k' }), 500, 'fk violation');
  const dup = fakeClient([{ data: null, error: { code: '23505', message: 'dup' } }]);
  await assertRejects(() => createEntities(dup.client).Passkey.create({ tenant_id: A, credential_id: 'c' }), 500, 'unique without a natural key');
});

Deno.test('update: no matching row is 404; a cost-only patch reads the row', async () => {
  const none = fakeClient([{ data: null, error: null }]);
  await assertRejects(() => createEntities(none.client).Order.update(ROW, { status: 'cobrada' }), 404, 'missing row');
  const costOnly = fakeClient([{ data: { id: ROW, tenant_id: A, inventory_item_cost: [] }, error: null }, { data: null, error: null }]);
  const out = await createEntities(costOnly.client).InventoryItem.update(ROW, { unit_cost: '' });
  assertEquals(costOnly.chains[0][1], ['select', '*, inventory_item_cost(unit_cost)']);
  assertEquals(costOnly.chains[1][1], ['upsert', { inventory_item_id: ROW, tenant_id: A, unit_cost: null }, { onConflict: 'inventory_item_id' }]);
  assertEquals(out.unit_cost, null);
});

Deno.test('User.delete removes the auth account; other deletes go by id', async () => {
  const { client, chains, deleted } = fakeClient();
  const e = createEntities(client);
  await e.User.delete(A);
  await e.StaffPin.delete(ROW);
  assertEquals(deleted, [A]);
  assertEquals(chains[0], [['from', 'staff_pin'], ['delete'], ['eq', 'id', ROW]]);
});

Deno.test('the proxy only answers entity names (await and JSON stay safe)', () => {
  const e = createEntities(fakeClient().client) as Record<string, unknown>;
  assertEquals([e.then, e.toJSON, typeof e.Order], [undefined, undefined, 'object']);
});

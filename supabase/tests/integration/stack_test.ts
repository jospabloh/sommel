// Phase 2 against a REAL local Supabase (`supabase start` + `supabase
// functions serve`, CI job `supabase-stack`): GoTrue issues the JWTs, PostgREST
// runs the shim's queries on the migrated schema, and the Edge Runtime serves
// the functions generated from base44/functions. What the in-memory fake
// (supabase/tests/functions) cannot prove: real SQL types, the cost-table
// embed, unique violations, the auth trigger that creates `profile`, and the
// JWT check.
//
// Needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY (from
// `supabase status -o env`). Never point it at the real project: it creates
// users and bars. It refuses any URL that is not localhost.
//   deno test --allow-env --allow-net supabase/tests/integration/
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { createEntities } from '../../functions/_shared/entities.ts';

const URL_ = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(URL_)) {
  throw new Error(`refusing to run against ${URL_ || '(unset)'}: local stack only`);
}

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg ?? 'assertEquals'}\n  actual:   ${a}\n  expected: ${e}`);
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL_, SERVICE, opts);
// deno-lint-ignore no-explicit-any
const entities = createEntities(admin as any);

const run = crypto.randomUUID().slice(0, 8);

async function person(label: string, tenantId: string | null, appRole: string | null) {
  const email = `${label}-${run}@example.test`;
  const password = `pw-${crypto.randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: label } });
  if (error) throw error;
  const id = data.user!.id;
  // profile was created by the auth trigger (D7); only the server sets the bar.
  if (tenantId) await entities.User.update(id, { tenant_id: tenantId, app_role: appRole });
  const anon = createClient(URL_, ANON, opts);
  const { data: session, error: e2 } = await anon.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  return { id, email, token: session.session!.access_token };
}

async function call(fn: string, token: string | null, body: unknown) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', apikey: ANON };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${URL_}/functions/v1/${fn}`, { method: 'POST', headers, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}

const barA = await entities.WineBar.create({ name: `Bar A ${run}`, billing_status: 'trial' });
const barB = await entities.WineBar.create({ name: `Bar B ${run}`, billing_status: 'active' });
const adminA = await person('admin-a', barA.id as string, 'bar_admin');
const staffA = await person('staff-a', barA.id as string, 'staff');
const adminB = await person('admin-b', barB.id as string, 'bar_admin');

Deno.test('the auth trigger made the profile, and the shim reads it as a Base44 User', async () => {
  const u = await entities.User.get(staffA.id);
  assertEquals([u.id, u.email, u.role, u.app_role, u.tenant_id], [staffA.id, staffA.email, 'user', 'staff', barA.id]);
});

Deno.test('functions: 401 without a session, the caller\'s own bar with one', async () => {
  const none = await call('stations', null, { action: 'getConfig' });
  assertEquals([none.status, none.body.code], [401, 'unauthenticated']);
  const r = await call('stations', staffA.token, { action: 'getConfig' });
  assertEquals([r.status, r.body.bar?.name], [200, `Bar A ${run}`]);
});

Deno.test('functions: another bar\'s row is 404, the same as a missing one', async () => {
  const order = await entities.Order.create({ tenant_id: barB.id, status: 'abierta' });
  const item = await entities.OrderItem.create({ tenant_id: barB.id, order_id: order.id, product_id: crypto.randomUUID(), name: 'Tinto', unit_price: 9000, status: 'enviado', station: 'kitchen' });
  const foreign = await call('stations', staffA.token, { action: 'markReady', item_ids: [item.id] });
  const missing = await call('stations', staffA.token, { action: 'markReady', item_ids: [crypto.randomUUID()] });
  assertEquals([foreign.status, missing.status], [404, 404]);
  assertEquals(foreign.body, missing.body);
  assertEquals((await entities.OrderItem.get(item.id as string)).status, 'enviado');
});

Deno.test('functions: each admin edits only their bar\'s permission profile', async () => {
  assertEquals((await call('permissions', staffA.token, { action: 'getProfile' })).status, 403);
  const saved = await call('permissions', adminA.token, { action: 'upsertProfile', overrides: { 'Estaciones:barra': false } });
  assertEquals(saved.status, 200);
  assertEquals((await call('permissions', adminB.token, { action: 'getProfile' })).body.profile?.overrides, {});
  const r = await call('stations', staffA.token, { action: 'getConfig' });
  assertEquals(r.body.stations, { kitchen: true, bar: false });
});

Deno.test('shim on real PostgREST: filters, order, window, cost table and empty strings', async () => {
  const order = await entities.Order.create({ tenant_id: barA.id, status: 'abierta', closed_at: '' });
  assertEquals(order.closed_at, null, "'' became null on timestamptz");
  const item = await entities.OrderItem.create({ tenant_id: barA.id, order_id: order.id, product_id: crypto.randomUUID(), name: 'Blanco', unit_price: 8000, unit_cost: 2500 });
  assertEquals((await entities.OrderItem.get(item.id as string)).unit_cost, 2500, 'cost read back through the embed');
  await entities.OrderItem.update(item.id as string, { unit_cost: 2600 });
  assertEquals((await entities.OrderItem.filter({ id: item.id }))[0].unit_cost, 2600);
  const { data: raw } = await admin.from('order_item').select('*').eq('id', item.id as string).single();
  assertEquals('unit_cost' in (raw as Record<string, unknown>), false, 'the parent row has no cost column');
  const since = new Date(Date.now() - 60_000).toISOString();
  const rows = await entities.Order.filter({ tenant_id: barA.id, id: { $in: [order.id, 'x'] }, created_date: { $gte: since } }, '-created_date', 5);
  assertEquals(rows.map((r) => r.id), [order.id]);
  assertEquals(await entities.Order.filter({ tenant_id: barA.id, id: '6705a1b2c3d4e5f6a7b8c9d0' }), [], 'a Base44 id matches nothing');
});

Deno.test('shim on real PostgREST: an idempotency key returns the first row', async () => {
  const order = await entities.Order.create({ tenant_id: barA.id, status: 'abierta' });
  const key = `pay-${run}`;
  const first = await entities.Payment.create({ tenant_id: barA.id, order_id: order.id, amount: 500, method: 'efectivo', idempotency_key: key });
  const again = await entities.Payment.create({ tenant_id: barA.id, order_id: order.id, amount: 500, method: 'efectivo', idempotency_key: key });
  assertEquals(again.id, first.id);
  assertEquals((await entities.Payment.filter({ tenant_id: barA.id, idempotency_key: key })).length, 1);
});

Deno.test('shim on real PostgREST: User.delete removes the account and its profile', async () => {
  const gone = await person('gone', null, null);
  await entities.User.delete(gone.id);
  assertEquals(await entities.User.filter({ id: gone.id }), []);
});

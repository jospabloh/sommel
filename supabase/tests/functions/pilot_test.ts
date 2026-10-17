// Phase 2 pilots: the Base44 `stations` and `permissions` routers, generated
// for Supabase (npm run generate:supabase-functions) and run end to end
// through the real guard, the base44 compat client and the entities shim,
// over an in-memory PostgREST. Two bars, so every test is also an isolation
// test: the guard, not RLS, scopes service-role reads, exactly as on Base44.
//   npm run test:supabase-functions
import { FakeDb } from './_fake_postgrest.ts';
import { setAdminClientForTests } from '../../functions/_shared/base44_compat.ts';
import stations from '../../functions/stations/router.ts';
import permissions from '../../functions/permissions/router.ts';
import { withCors } from '../../functions/_shared/serve.ts';

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg ?? 'assertEquals'}\n  actual:   ${a}\n  expected: ${e}`);
}

function world() {
  const db = new FakeDb();
  const barA = db.seed('wine_bar', { name: 'Bar A', billing_status: 'trial' });
  const barB = db.seed('wine_bar', { name: 'Bar B', billing_status: 'active' });
  const person = (email: string, tenant: string | null, app_role: string | null) => {
    const user_id = crypto.randomUUID();
    db.seed('profile', { user_id, email, tenant_id: tenant, app_role, is_platform: false, photo_check: false });
    return { user_id, token: db.signIn(user_id, email) };
  };
  const adminA = person('admin@a.mx', barA.id as string, 'bar_admin');
  const staffA = person('staff@a.mx', barA.id as string, 'staff');
  const adminB = person('admin@b.mx', barB.id as string, 'bar_admin');
  const nobody = person('nadie@x.mx', null, null);
  const orderB = db.seed('orders', { tenant_id: barB.id, status: 'abierta' });
  const itemB = db.seed('order_item', { tenant_id: barB.id, order_id: orderB.id, product_id: crypto.randomUUID(), status: 'enviado', station: 'kitchen' });
  setAdminClientForTests(db.client());
  return { db, barA, barB, adminA, staffA, adminB, nobody, itemB };
}

async function call(fn: (req: Request) => Promise<Response>, token: string | null, body: unknown) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fn(new Request('http://x/functions/v1/f', { method: 'POST', headers, body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json() };
}

Deno.test('no session, or a bad token, is 401 in Spanish before any read', async () => {
  const { db } = world();
  const before = db.ops;
  const r = await call(stations, null, { action: 'getConfig' });
  assertEquals([r.status, r.body.code, r.body.error], [401, 'unauthenticated', 'Inicia sesión para continuar']);
  assertEquals((await call(stations, 'tok-forged', { action: 'getConfig' })).status, 401);
  assertEquals(db.ops, before, 'no database operation');
});

Deno.test('unknown action is 400, a user with no bar is 403 no_tenant', async () => {
  const { nobody, staffA } = world();
  assertEquals((await call(stations, staffA.token, { action: 'nope' })).body.code, 'unknown_action');
  assertEquals((await call(stations, nobody.token, { action: 'getConfig' })).body.code, 'no_tenant');
});

Deno.test('stations.getConfig answers with the caller\'s own bar', async () => {
  const { staffA } = world();
  const r = await call(stations, staffA.token, { action: 'getConfig' });
  assertEquals([r.status, r.body.bar.name, r.body.bar.billing_status, r.body.stations], [200, 'Bar A', 'trial', { kitchen: true, bar: true }]);
});

Deno.test('another bar\'s order line is 404, the same as a missing one', async () => {
  const { staffA, itemB, db } = world();
  const foreign = await call(stations, staffA.token, { action: 'markReady', item_ids: [itemB.id] });
  const missing = await call(stations, staffA.token, { action: 'markReady', item_ids: [crypto.randomUUID()] });
  const base44Id = await call(stations, staffA.token, { action: 'markReady', item_ids: ['6705a1b2c3d4e5f6a7b8c9d0'] });
  assertEquals([foreign.status, missing.status, base44Id.status], [404, 404, 404]);
  assertEquals(foreign.body, missing.body, 'no existence oracle');
  assertEquals(db.rows('order_item').find((r) => r.id === itemB.id)?.status, 'enviado', 'untouched');
});

Deno.test('permissions: staff is refused; each admin reads and writes only their bar', async () => {
  const { staffA, adminA, adminB, db, barA } = world();
  assertEquals((await call(permissions, staffA.token, { action: 'getProfile' })).status, 403);
  const save = await call(permissions, adminA.token, { action: 'upsertProfile', overrides: { 'Estaciones:barra': false } });
  assertEquals([save.status, save.body.profile], [200, { role: 'staff', overrides: { 'Estaciones:barra': false } }]);
  assertEquals((await call(permissions, adminA.token, { action: 'getProfile' })).body.profile.overrides, { 'Estaciones:barra': false });
  assertEquals((await call(permissions, adminB.token, { action: 'getProfile' })).body.profile.overrides, {}, 'bar B sees nothing of A');
  // Saving again updates the one row (unique (tenant_id, role)), never a second.
  await call(permissions, adminA.token, { action: 'upsertProfile', overrides: {} });
  assertEquals(db.rows('permission_profile').filter((r) => r.tenant_id === barA.id).length, 1);
});

Deno.test('the staff override takes effect through the same guard (stations.getConfig)', async () => {
  const { staffA, adminA } = world();
  await call(permissions, adminA.token, { action: 'upsertProfile', overrides: { 'Estaciones:barra': false } });
  // permissions forgets its own cache; stations reads the profile fresh on a cold instance.
  const r = await call(stations, staffA.token, { action: 'getConfig' });
  assertEquals(r.body.stations, { kitchen: true, bar: false });
});

Deno.test('CORS: preflight and allowed origin; a foreign origin gets no allow header', async () => {
  const served = withCors(stations);
  const pre = await served(new Request('http://x', { method: 'OPTIONS', headers: { Origin: 'https://sommel.acaciaco.com.mx' } }));
  assertEquals([pre.status, pre.headers.get('Access-Control-Allow-Origin')], [204, 'https://sommel.acaciaco.com.mx']);
  const evil = await served(new Request('http://x', { method: 'POST', headers: { Origin: 'https://evil.example' }, body: '{}' }));
  assertEquals(evil.headers.get('Access-Control-Allow-Origin'), null);
});

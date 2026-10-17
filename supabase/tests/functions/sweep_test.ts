// Phase 2 sweep: EVERY action of EVERY generated router, called by the admin
// and by the staff of a bar with data, over the in-memory PostgREST. No call
// may answer 500: on Base44 these all answer 2xx/4xx, so a 500 here means the
// port broke something (a filter the shim refuses, a field it does not know, a
// Base44-only API). Bodies are deliberately thin: this proves the plumbing,
// not each action's business rules, which keep their own tests.
//   npm run test:supabase-functions
import { FakeDb } from './_fake_postgrest.ts';
import { setAdminClientForTests } from '../../functions/_shared/base44_compat.ts';

const ROOT = new URL('../../../', import.meta.url);

// Action names straight from each Base44 entry.ts: the keys of
// `handle(req, { ... })`, or the `action === '...'` branches of the routers
// that dispatch by hand.
function actionsOf(router: string): string[] {
  const src = Deno.readTextFileSync(new URL(`base44/functions/${router}/entry.ts`, ROOT));
  const block = src.match(/handle\(req,\s*\{([\s\S]*?)\}\s*\)/);
  if (block) {
    return [...block[1].matchAll(/^\s*(?:'([\w.]+)'|([\w]+))\s*(?::|,|$)/gm)].map((m) => m[1] ?? m[2]).filter(Boolean);
  }
  const names = new Set<string>();
  for (const m of src.matchAll(/(?:action\s*===\s*|case\s+)'([\w.]+)'/g)) names.add(m[1]);
  // createWineBar takes no action: one call is the whole router.
  return names.size ? [...names] : ['(none)'];
}

// Routers that do not take a user session: they get their own checks below.
const SELF_AUTH = new Set(['acaciaControl', 'cloudprnt', 'purgeStaleSessions']);

const routers = [...Deno.readDirSync(new URL('supabase/functions/', ROOT))]
  .filter((e) => e.isDirectory && e.name !== '_shared')
  .map((e) => e.name)
  .sort();

function world() {
  const db = new FakeDb();
  const bar = db.seed('wine_bar', { name: 'Bar A', billing_status: 'active', pin_length: 4 });
  const other = db.seed('wine_bar', { name: 'Bar B', billing_status: 'active' });
  const person = (email: string, tenant: string, app_role: string) => {
    const user_id = crypto.randomUUID();
    db.seed('profile', { user_id, email, full_name: email, tenant_id: tenant, app_role, is_platform: false, photo_check: false });
    return { user_id, token: db.signIn(user_id, email) };
  };
  const admin = person('admin@a.mx', bar.id as string, 'bar_admin');
  const staff = person('staff@a.mx', bar.id as string, 'staff');
  person('admin@b.mx', other.id as string, 'bar_admin');
  const shift = db.seed('shift', { tenant_id: bar.id, status: 'abierto', opened_by: 'admin@a.mx', opening_cash: 0 });
  const cat = db.seed('category', { tenant_id: bar.id, name: 'Vinos', station_default: 'bar' });
  const product = db.seed('product', { tenant_id: bar.id, category_id: cat.id, name: 'Tinto', price: 9000, station: 'bar', active: true, variants: [], modifiers: [] });
  const table = db.seed('bar_table', { tenant_id: bar.id, name: 'Mesa 1', status: 'ocupada' });
  const order = db.seed('orders', { tenant_id: bar.id, status: 'abierta', type: 'mesa', table_ids: [table.id], shift_id: shift.id, subtotal: 9000, total: 9000 });
  db.seed('order_item', { tenant_id: bar.id, order_id: order.id, product_id: product.id, name: 'Tinto', unit_price: 9000, qty: 1, status: 'enviado', station: 'bar' });
  db.seed('inventory_item', { tenant_id: bar.id, name: 'Botella', unit: 'pza', stock: 10 });
  setAdminClientForTests(db.client());
  return { admin, staff };
}

async function call(router: string, token: string | null, body: unknown) {
  const mod = await import(new URL(`supabase/functions/${router}/router.ts`, ROOT).href);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await mod.default(new Request(`http://x/functions/v1/${router}`, { method: 'POST', headers, body: JSON.stringify(body) }));
  const text = await res.text();
  return { status: res.status as number, text };
}

Deno.test('the sweep finds every router and its actions', () => {
  if (routers.length !== 21) throw new Error(`expected 21 generated routers, got ${routers.length}: run generate:supabase-functions`);
  for (const r of routers.filter((r) => !SELF_AUTH.has(r))) {
    if (actionsOf(r).length === 0) throw new Error(`no actions parsed for ${r}`);
  }
});

for (const router of routers.filter((r) => !SELF_AUTH.has(r))) {
  Deno.test(`${router}: no action answers 500, for admin or staff`, async () => {
    const failures: string[] = [];
    for (const action of actionsOf(router)) {
      for (const who of ['admin', 'staff'] as const) {
        const w = world();
        const r = await call(router, w[who].token, { action });
        if (Deno.env.get('SWEEP_VERBOSE')) console.log(`${router}.${action} ${who} ${r.status} ${r.text.slice(0, 90)}`);
        if (r.status >= 500) failures.push(`${action} as ${who}: ${r.status} ${r.text.slice(0, 200)}`);
      }
    }
    if (failures.length) throw new Error(`\n  ${failures.join('\n  ')}`);
  });
}

Deno.test('self-authenticating routers refuse an unsigned call without a 500', async () => {
  world();
  for (const router of SELF_AUTH) {
    const r = await call(router, null, { action: 'ping' });
    // Without their secrets they answer 4xx or a deliberate 503, never a crash.
    if (r.status >= 500 && r.status !== 503) throw new Error(`${router}: ${r.status} ${r.text.slice(0, 200)}`);
  }
});

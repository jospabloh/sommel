// Phase 2, the catalog and people batches: a bar's first day through the
// generated routers on the in-memory PostgREST. Someone signs up and creates a
// bar, invites a waiter (no email on Supabase yet: the invite link comes back),
// the waiter claims it, the admin builds a menu with a linked supply, sells,
// and reads the report; the waiter never sees a cost. It exercises the
// people functions that do not use the shared guard (createWineBar,
// manageStaff), the inventory `$in` reads and the cost redaction.
//   npm run test:supabase-functions
import { FakeDb } from './_fake_postgrest.ts';
import { setAdminClientForTests } from '../../functions/_shared/base44_compat.ts';
import createWineBar from '../../functions/createWineBar/router.ts';
import manageStaff from '../../functions/manageStaff/router.ts';
import catalog from '../../functions/catalog/router.ts';
import inventory from '../../functions/inventory/router.ts';
import settings from '../../functions/settings/router.ts';
import shifts from '../../functions/shifts/router.ts';
import orders from '../../functions/orders/router.ts';
import payments from '../../functions/payments/router.ts';
import reports from '../../functions/reports/router.ts';
import support from '../../functions/support/router.ts';

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg ?? 'assertEquals'}\n  actual:   ${a}\n  expected: ${e}`);
}

type Fn = (req: Request) => Promise<Response>;
async function raw(fn: Fn, token: string, body: Record<string, unknown>) {
  const res = await fn(new Request('http://x', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  }));
  return { status: res.status, body: await res.json() };
}
async function ok(fn: Fn, token: string, body: Record<string, unknown>) {
  const r = await raw(fn, token, body);
  if (r.status !== 200) throw new Error(`${body.action ?? 'call'}: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}

Deno.test('a bar\'s first day: create, invite, claim, menu with stock, sell, report', async () => {
  const db = new FakeDb();
  const signUp = (email: string) => {
    const user_id = crypto.randomUUID();
    // What the auth trigger does on Supabase (D7): a profile with no bar.
    db.seed('profile', { user_id, email, full_name: null, is_platform: false, photo_check: false });
    return { user_id, token: db.signIn(user_id, email) };
  };
  setAdminClientForTests(db.client());

  const owner = signUp('duena@vindima.mx');
  const created = await ok(createWineBar, owner.token, { name: 'Vindima', display_name: 'Alby' });
  const barId = db.rows('profile').find((p) => p.user_id === owner.user_id)?.tenant_id;
  assertEquals([typeof barId, db.rows('profile').find((p) => p.user_id === owner.user_id)?.app_role], ['string', 'bar_admin']);
  assertEquals(db.rows('wine_bar').find((b) => b.id === barId)?.billing_status, 'trial', JSON.stringify(created).slice(0, 80));
  assertEquals((await raw(createWineBar, owner.token, { name: 'Otro' })).status, 409, 'one bar per person');

  // Email is off until phase 4: the invite is saved and its link comes back.
  const invite = await ok(manageStaff, owner.token, { action: 'invite', email: 'mesero@vindima.mx', app_role: 'staff' });
  assertEquals([invite.email_sent, typeof invite.invite_url], [false, 'string']);
  const waiter = signUp('mesero@vindima.mx');
  const claim = await ok(manageStaff, waiter.token, { action: 'claimInvite' });
  assertEquals([claim.claimed, claim.tenant_id], [true, barId]);
  const team = await ok(manageStaff, owner.token, { action: 'list' });
  assertEquals(team.staff.map((p: { email: string }) => p.email).sort(), ['duena@vindima.mx', 'mesero@vindima.mx']);

  await ok(settings, owner.token, { action: 'update', corte_emails: ['duena@vindima.mx'] });
  const { category } = await ok(catalog, owner.token, { action: 'upsertCategory', name: 'Vinos', station_default: 'bar' });
  const { product } = await ok(catalog, owner.token, { action: 'upsertProduct', name: 'Copa tinto', category_id: category.id, station: 'bar', price: 12000, cost: 4000 });
  const { item } = await ok(inventory, owner.token, { action: 'upsertItem', name: 'Botella tinto', unit: 'ml', unit_cost: 40 });
  await ok(inventory, owner.token, { action: 'addEntry', item_id: item.id, qty: 750, idempotency_key: 'entrada-0001' });
  await ok(inventory, owner.token, { action: 'linkProduct', product_id: product.id, inventory_item_id: item.id, inventory_qty: 150 });

  const staffMenu = await ok(catalog, waiter.token, { action: 'listProducts' });
  assertEquals('cost' in staffMenu.products[0], false, 'the waiter never sees the cost');
  assertEquals((await ok(catalog, owner.token, { action: 'listProducts' })).products[0].cost, 4000);

  await ok(shifts, owner.token, { action: 'open', opening_float: 0 });
  const { order } = await ok(orders, waiter.token, { action: 'open', type: 'llevar', customer_name: 'Ana' });
  await ok(orders, waiter.token, { action: 'addItems', order_id: order.id, batch_key: 'batch-0002', items: [{ product_id: product.id, qty: 2 }] });
  await ok(orders, waiter.token, { action: 'send', order_id: order.id });
  const paid = await ok(payments, waiter.token, { action: 'addPayment', order_id: order.id, method: 'efectivo', amount: 24000, idempotency_key: 'pago-0002' });
  assertEquals([paid.closed, paid.inventory_warning ?? null], [true, null]);
  const stock = await ok(inventory, owner.token, { action: 'list' });
  assertEquals(stock.items.find((i: { id: string }) => i.id === item.id)?.stock, 450, '750 in, 2 x 150 sold');

  // The bar's day (UTC-6) of the sale itself, not of a second clock read that
  // could cross midnight (Codex, #105).
  const today = new Date(Date.parse(paid.order.closed_at) - 6 * 3600_000).toISOString().slice(0, 10);
  const report = await ok(reports, owner.token, { action: 'summary', from: today, to: today });
  assertEquals(report.totals?.sales_net, 24000, JSON.stringify(report.totals));

  // Support: the bar answers its own ticket; another bar's is 404.
  const ticket = db.seed('support_ticket', { tenant_id: barId, subject: 'Hola', body: 'Ayuda', status: 'abierto', responses: [] });
  await ok(support, owner.token, { action: 'replyTicket', ticket_id: ticket.id, body: 'Gracias' });
  assertEquals((db.rows('support_ticket')[0].responses as unknown[]).length, 1);
  const otherBar = db.seed('wine_bar', { name: 'Otro', billing_status: 'active' });
  const foreign = db.seed('support_ticket', { tenant_id: otherBar.id, subject: 'x', body: 'y', status: 'abierto', responses: [] });
  assertEquals((await raw(support, owner.token, { action: 'replyTicket', ticket_id: foreign.id, body: 'z' })).status, 404);
});

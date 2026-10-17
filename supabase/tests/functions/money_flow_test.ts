// Phase 2, the money batch: one whole cuenta through the generated routers
// (shifts, orders, stations, payments, printing), on the in-memory PostgREST.
// It proves the handlers' multi-step writes work through the shim: frozen
// price and cost, the cost table, totals, idempotent payment, the ticket job,
// the printer claim and the shift close. Business rules keep their own tests.
//   npm run test:supabase-functions
import { FakeDb } from './_fake_postgrest.ts';
import { setAdminClientForTests } from '../../functions/_shared/base44_compat.ts';
import shifts from '../../functions/shifts/router.ts';
import orders from '../../functions/orders/router.ts';
import stations from '../../functions/stations/router.ts';
import payments from '../../functions/payments/router.ts';
import printing from '../../functions/printing/router.ts';

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg ?? 'assertEquals'}\n  actual:   ${a}\n  expected: ${e}`);
}

type Fn = (req: Request) => Promise<Response>;
async function call(fn: Fn, token: string, body: Record<string, unknown>) {
  const res = await fn(new Request('http://x', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  }));
  const json = await res.json();
  if (res.status !== 200) throw new Error(`${body.action}: ${res.status} ${JSON.stringify(json)}`);
  return json;
}

Deno.test('a whole cuenta: open shift, order, send, ready, pay, ticket, print, close', async () => {
  const db = new FakeDb();
  const bar = db.seed('wine_bar', { name: 'Bar A', billing_status: 'active', print_comandas: false, auto_deliver_no_station: true, allow_negative_stock: true });
  const adminId = crypto.randomUUID();
  db.seed('profile', { user_id: adminId, email: 'admin@a.mx', tenant_id: bar.id, app_role: 'bar_admin', is_platform: false, photo_check: false });
  const token = db.signIn(adminId, 'admin@a.mx');
  const cat = db.seed('category', { tenant_id: bar.id, name: 'Vinos', station_default: 'bar', sort: 0 });
  const product = db.seed('product', { tenant_id: bar.id, category_id: cat.id, name: 'Tinto', price: 9000, cost: 3000, station: 'bar', active: true, variants: [], modifiers: [], track_inventory: false });
  const table = db.seed('bar_table', { tenant_id: bar.id, name: 'Mesa 1', status: 'libre', seats: 4 });
  setAdminClientForTests(db.client());

  await call(shifts, token, { action: 'open', opening_float: 50000 });
  const { order } = await call(orders, token, { action: 'open', type: 'mesa', table_id: table.id });
  const added = await call(orders, token, { action: 'addItems', order_id: order.id, batch_key: 'batch-0001', items: [{ product_id: product.id, qty: 2 }] });
  assertEquals(added.items.length, 1);
  const again = await call(orders, token, { action: 'addItems', order_id: order.id, batch_key: 'batch-0001', items: [{ product_id: product.id, qty: 2 }] });
  assertEquals(again.idempotent, true, 'a retried batch adds nothing');
  assertEquals(db.rows('order_item').length, 1);
  const itemId = added.items[0].id;
  assertEquals(db.rows('order_item_cost').map((c) => [c.order_item_id, c.unit_cost]), [[itemId, 3000]], 'cost frozen into the cost table');

  await call(orders, token, { action: 'send', order_id: order.id });
  await call(stations, token, { action: 'markReady', item_ids: [itemId] });
  assertEquals(db.rows('order_item')[0].status, 'listo');

  const pay = { action: 'addPayment', order_id: order.id, method: 'efectivo', amount: 18000, received: 20000, idempotency_key: 'pay-0001' };
  const paid = await call(payments, token, pay);
  assertEquals([paid.closed, paid.change, paid.order.status], [true, 2000, 'cobrada']);
  await call(payments, token, pay);
  assertEquals(db.rows('payment').length, 1, 'the same idempotency key pays once');

  const { job } = await call(payments, token, { action: 'requestTicket', order_id: order.id });
  assertEquals(job.kind, 'ticket');
  const claimed = await call(printing, token, { action: 'claimNext', device_id: 'caja-1' });
  assertEquals(claimed.job?.id, job.id);
  await call(printing, token, { action: 'markPrinted', job_id: job.id, device_id: 'caja-1' });
  assertEquals(db.rows('print_job').find((j) => j.id === job.id)?.status, 'impreso');

  const closed = await call(shifts, token, { action: 'close', counted_cash: 68000 });
  assertEquals([!!closed.shift.closed_at, closed.shift.expected_cash, closed.shift.difference], [true, 68000, 0], 'float + cash sale');
  // Email is off until phase 4: the close is saved anyway, never failed by mail.
  assertEquals(typeof closed.email_status, 'string');
});

// Deno tests for base44/functions/payments/handlers/_logic.ts and _ticket.ts.
// Both only import import-free files, so this runs with deno.land blocked.
//
//   deno test --allow-env base44/tests/payments_logic_test.ts

import {
  LogicError,
  resolveMethod,
  computeCash,
  validatePaymentAmount,
  remainingOf,
  paidTotal,
  shouldClose,
  canCloseWithoutPayment,
  planDiscount,
  planTip,
  splitByItems,
  validateParts,
  planInventoryMovements,
  stockFromMovements,
  ticketMoney,
  formatLocalDateTime,
} from '../functions/payments/handlers/_logic.ts';
import { buildTicketLines, wrapText } from '../functions/payments/handlers/_ticket.ts';
import {
  DEFAULT_PAYMENT_METHODS,
  computeOrderTotals,
  pickSurvivor,
  splitEqual,
} from '../../scripts/templates/_guard_logic.ts';

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(msg || `expected ${e}, got ${a}`);
}

function assertCode(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (e) {
    if (!(e instanceof LogicError)) throw new Error('expected a LogicError');
    if (e.code !== code) throw new Error(`expected code ${code}, got ${e.code}`);
    return;
  }
  throw new Error('expected function to throw');
}

const cash = DEFAULT_PAYMENT_METHODS[0];
const card = DEFAULT_PAYMENT_METHODS[1];

// ---- methods ----

Deno.test('resolveMethod: finds an active method, rejects unknown and inactive', () => {
  assertEquals(resolveMethod(DEFAULT_PAYMENT_METHODS, 'tarjeta').key, 'tarjeta');
  assertCode(() => resolveMethod(DEFAULT_PAYMENT_METHODS, 'bitcoin'), 'invalid_method');
  const off = [{ ...card, active: false }];
  assertCode(() => resolveMethod(off, 'tarjeta'), 'invalid_method');
});

// ---- change math ----

Deno.test('computeCash: change = received - amount, server side', () => {
  assertEquals(computeCash(cash, 45000, 50000), { received: 50000, change: 5000 });
});

Deno.test('computeCash: exact and missing received mean zero change', () => {
  assertEquals(computeCash(cash, 45000, 45000), { received: 45000, change: 0 });
  assertEquals(computeCash(cash, 45000, undefined), { received: 45000, change: 0 });
});

Deno.test('computeCash: received below amount is rejected', () => {
  assertCode(() => computeCash(cash, 45000, 40000), 'received_too_low');
});

Deno.test('computeCash: non-cash keeps neither received nor change', () => {
  assertEquals(computeCash(card, 45000, 99999), {});
});

// ---- overpay ----

Deno.test('validatePaymentAmount: rejects amount above what is left', () => {
  assertCode(() => validatePaymentAmount(10001, 10000), 'amount_exceeds_remaining');
  assertEquals(validatePaymentAmount(10000, 10000), 10000);
});

Deno.test('validatePaymentAmount: rejects zero, negative, fractional and non-numbers', () => {
  for (const bad of [0, -5, 10.5, '100', null, undefined]) {
    assertCode(() => validatePaymentAmount(bad, 10000), 'invalid_amount');
  }
});

Deno.test('remainingOf ignores voided payments and never goes negative', () => {
  const payments = [{ amount: 3000 }, { amount: 2000, voided_at: '2026-09-28T10:00:00Z' }];
  assertEquals(paidTotal(payments), 3000);
  assertEquals(remainingOf(10000, payments), 7000);
  assertEquals(remainingOf(1000, payments), 0);
});

// ---- close condition ----

Deno.test('shouldClose: only when live payments cover a positive total', () => {
  assertEquals(shouldClose(10000, 9999), false);
  assertEquals(shouldClose(10000, 10000), true);
  assertEquals(shouldClose(10000, 12000), true);
  assertEquals(shouldClose(0, 0), false);
});

Deno.test('shouldClose: a voided payment reopens the condition', () => {
  const payments = [{ amount: 10000, voided_at: '2026-09-28T10:00:00Z' }];
  assertEquals(shouldClose(10000, paidTotal(payments)), false);
});

Deno.test('canCloseWithoutPayment: only a fully discounted order with real lines', () => {
  assertEquals(canCloseWithoutPayment({ total: 0, subtotal: 5000 }, 0), true);
  assertEquals(canCloseWithoutPayment({ total: 0, subtotal: 0 }, 0), false);
  assertEquals(canCloseWithoutPayment({ total: 5000, subtotal: 5000 }, 0), false);
});

// ---- discount and tip ----

Deno.test('planDiscount: percentage, fixed amount, cortesia and ninguno', () => {
  assertEquals(planDiscount({ kind: 'descuento', pct: 10, reason: 'Amigo', subtotal: 12345 }), {
    discount_kind: 'descuento', discount_pct: 10, discount: 1235, discount_reason: 'Amigo',
  });
  assertEquals(planDiscount({ kind: 'descuento', amount: 500, reason: 'x', subtotal: 1000 }).discount, 500);
  assertEquals(planDiscount({ kind: 'cortesia', reason: 'Casa', subtotal: 777 }).discount, 777);
  assertEquals(planDiscount({ kind: 'ninguno', subtotal: 777 }).discount, 0);
});

Deno.test('planDiscount: reason is mandatory, amount cannot exceed subtotal, one of pct/amount', () => {
  assertCode(() => planDiscount({ kind: 'descuento', pct: 10, reason: '  ', subtotal: 1000 }), 'reason_required');
  assertCode(() => planDiscount({ kind: 'cortesia', subtotal: 1000 }), 'reason_required');
  assertCode(() => planDiscount({ kind: 'descuento', amount: 2000, reason: 'x', subtotal: 1000 }), 'discount_exceeds_subtotal');
  assertCode(() => planDiscount({ kind: 'descuento', pct: 5, amount: 10, reason: 'x', subtotal: 1000 }), 'invalid_discount');
  assertCode(() => planDiscount({ kind: 'descuento', pct: 101, reason: 'x', subtotal: 1000 }), 'invalid_pct');
});

Deno.test('planTip: pct, amount, none; not both', () => {
  assertEquals(planTip({ pct: 10, base: 10000 }), { tip_pct: 10, tip: 1000 });
  assertEquals(planTip({ amount: 700, base: 10000 }), { tip_pct: null, tip: 700 });
  assertEquals(planTip({ base: 10000 }), { tip_pct: null, tip: 0 });
  assertCode(() => planTip({ pct: 10, amount: 5, base: 1 }), 'invalid_tip');
});

Deno.test('totals with discount and tip come out of the shared computeOrderTotals', () => {
  const items = [{ unit_price: 5000, qty: 2, status: 'enviado' }, { unit_price: 999, qty: 1, status: 'cancelado' }];
  assertEquals(computeOrderTotals(items, { discount_pct: 10, tip_pct: 10 }),
    { subtotal: 10000, discount: 1000, tip: 900, total: 9900 });
});

// ---- split ----

Deno.test('split equal: leftover centavos go to the first parts and add up', () => {
  const amounts = splitEqual(10000, 3);
  assertEquals(amounts, [3334, 3333, 3333]);
  assertEquals(amounts.reduce((a, b) => a + b, 0), 10000);
  assertCode(() => validateParts(1), 'invalid_parts');
  assertCode(() => validateParts(21), 'invalid_parts');
});

Deno.test('split by items: prorates discount and tip over the chosen lines', () => {
  const items = [
    { id: 'a', unit_price: 6000, qty: 1, status: 'enviado' },
    { id: 'b', unit_price: 4000, qty: 1, status: 'enviado' },
  ];
  // subtotal 10000, 10% off, 10% tip on the discounted base => total 9900.
  const order = { subtotal: 10000, total: 9900 };
  assertEquals(splitByItems(items, ['a'], order, 9900), 5940);
  assertEquals(splitByItems(items, ['b'], order, 9900), 3960);
  assertEquals(splitByItems(items, ['a', 'b'], order, 9900), 9900);
});

Deno.test('split by items: capped at remaining, unknown or cancelled ids rejected', () => {
  const items = [
    { id: 'a', unit_price: 6000, qty: 1, status: 'enviado' },
    { id: 'c', unit_price: 100, qty: 1, status: 'cancelado' },
  ];
  assertEquals(splitByItems(items, ['a'], { subtotal: 6000, total: 6000 }, 2500), 2500);
  assertCode(() => splitByItems(items, ['zzz'], { subtotal: 6000, total: 6000 }, 6000), 'invalid_items');
  assertCode(() => splitByItems(items, ['c'], { subtotal: 6000, total: 6000 }, 6000), 'invalid_items');
  assertCode(() => splitByItems(items, [], { subtotal: 6000, total: 6000 }, 6000), 'invalid_items');
});

// ---- idempotency survivor ----

Deno.test('idempotency: oldest created_date survives, id breaks ties', () => {
  const rows = [
    { id: 'p2', created_date: '2026-09-28T10:00:00.500Z' },
    { id: 'p1', created_date: '2026-09-28T10:00:00.100Z' },
    { id: 'p0', created_date: '2026-09-28T10:00:00.100Z' },
  ];
  assertEquals(pickSurvivor(rows)?.id, 'p0');
  assertEquals(pickSurvivor([]), null);
});

// ---- inventory plan ----

Deno.test('planInventoryMovements: venta and merma keys, variant qty, untracked skipped', () => {
  const products = {
    wine: { track_inventory: true, inventory_item_id: 'inv1', inventory_qty: 1 },
    copa: {
      track_inventory: true, inventory_item_id: 'inv2', inventory_qty: 150,
      variants: [{ key: 'grande', inventory_qty: 250 }],
    },
    water: { track_inventory: false, inventory_item_id: 'inv3', inventory_qty: 1 },
  };
  const items = [
    { id: 'i1', product_id: 'wine', qty: 2, status: 'entregado' },
    { id: 'i2', product_id: 'copa', variant: 'grande', qty: 2, status: 'listo' },
    { id: 'i3', product_id: 'copa', qty: 1, status: 'cancelado', prepared: true },
    { id: 'i4', product_id: 'copa', qty: 1, status: 'cancelado', prepared: false },
    { id: 'i5', product_id: 'water', qty: 1, status: 'entregado' },
  ];
  const plan = planInventoryMovements(items, products);
  assertEquals(plan.map((m) => [m.idempotency_key, m.inventory_item_id, m.type, m.qty]), [
    ['venta:i1', 'inv1', 'venta', -2],
    ['venta:i2', 'inv2', 'venta', -500],
    ['merma:i3', 'inv2', 'merma', -150],
  ]);
});

Deno.test('stockFromMovements: stock is the sum of qty, duplicates zeroed out', () => {
  assertEquals(stockFromMovements([{ qty: 10 }, { qty: -2 }, { qty: 0 }, { qty: -0.5 }]), 7.5);
  assertEquals(stockFromMovements([]), 0);
});

// ---- ticket ----

const baseInput = {
  bar: { name: 'Vindima Wine Bar', ticket_header: 'Av. Siempre Viva 123, Aguascalientes', ticket_footer: 'Gracias por su visita', rfc: 'ABC010101AB1' },
  when: '2026-09-28T20:35:00.000Z',
  place: 'Mesa 4',
  items: [
    { name: 'Tabla chica', variant_label: 'Chico (2-4 personas)', qty: 2, unit_price: 28000, status: 'entregado', modifiers: [{ label: 'Sin nueces' }] },
    { name: 'Copa de la casa con un nombre extremadamente largo para papel', qty: 1, unit_price: 9000, status: 'enviado' },
    { name: 'Cancelado', qty: 1, unit_price: 100, status: 'cancelado' },
  ],
  order: { subtotal: 65000, discount: 6500, discount_kind: 'descuento', discount_reason: 'Cliente frecuente de la casa desde hace años', tip: 5850, total: 64350 },
  payments: [
    { method_label: 'Efectivo', amount: 50000, received: 60000, change: 10000 },
    { method_label: 'Tarjeta', amount: 14350 },
    { method_label: 'Vales', amount: 999, voided_at: '2026-09-28T21:00:00Z' },
  ],
};

Deno.test('ticket: every line fits in 32 columns', () => {
  const lines = buildTicketLines(baseInput);
  for (const l of lines) {
    if (l.text.length > 32) throw new Error(`line too wide (${l.text.length}): ${l.text}`);
  }
});

Deno.test('ticket: layout content, cancelled lines and voided payments left out', () => {
  const texts = buildTicketLines(baseInput).map((l) => l.text);
  const joined = texts.join('\n');
  if (!joined.includes('2 x Tabla chica')) throw new Error('missing item line');
  if (!joined.includes('$560.00')) throw new Error('missing item amount');
  if (!joined.includes('  Sin nueces')) throw new Error('modifier should be indented');
  if (joined.includes('Cancelado')) throw new Error('cancelled line printed');
  if (joined.includes('Vales')) throw new Error('voided payment printed');
  if (!joined.includes('Recibido') || !joined.includes('Cambio')) throw new Error('cash detail missing');
  if (!joined.includes('Motivo:')) throw new Error('discount reason missing');
  if (!joined.includes('28/09/2026 14:35')) throw new Error('local time wrong: ' + joined);
  assertEquals(texts[texts.length - 1], 'Este ticket no es una factura');
  assertEquals(texts.find((t) => t.startsWith('TOTAL')), 'TOTAL                    $643.50');
  assertEquals('TOTAL                    $643.50'.length, 32);
});

Deno.test('ticket: cortesia is labelled and a bare bar still builds', () => {
  const lines = buildTicketLines({
    ...baseInput,
    bar: {},
    order: { subtotal: 1000, discount: 1000, discount_kind: 'cortesia', discount_reason: 'Casa', tip: 0, total: 0 },
    payments: [],
  });
  const joined = lines.map((l) => l.text).join('\n');
  if (!joined.includes('Cortesía')) throw new Error('cortesia label missing');
  for (const l of lines) if (l.text.length > 32) throw new Error('too wide');
});

Deno.test('wrapText: wraps on words and hard-cuts a monster word', () => {
  for (const l of wrapText('a'.repeat(70) + ' hola mundo')) {
    if (l.length > 32) throw new Error('too wide');
  }
});

Deno.test('ticketMoney and local time helpers', () => {
  assertEquals(ticketMoney(56000), '$560.00');
  assertEquals(ticketMoney(123456789), '$1,234,567.89');
  assertEquals(ticketMoney(5), '$0.05');
  assertEquals(formatLocalDateTime('2026-09-29T03:00:00Z'), '28/09/2026 21:00');
});

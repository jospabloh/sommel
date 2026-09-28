// Deno tests for base44/functions/shifts/handlers/_logic.ts (zero external
// imports; padLine comes from the guard's pure logic file).
//   deno test --allow-env base44/tests/shifts_logic_test.ts
import {
  LogicError,
  buildCorteEmail,
  cashVerdict,
  buildCorteLines,
  buildSummary,
  cashMethodKeys,
  computeExpectedCash,
  fmtMoney,
  formatLocalDateTime,
  normalizeComment,
  redactShift,
  requiresComment,
  salesByMethod,
  validateCashOut,
  validateCountedCash,
  validateOpeningFloat,
  wrapText,
} from '../functions/shifts/handlers/_logic.ts';
import { padLine, BAR_UTC_OFFSET_MIN } from '../../scripts/templates/_guard_logic.ts';

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(msg || `expected ${e}, got ${a}`);
}
function assertCode(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (err) {
    if (err instanceof LogicError && err.code === code) return;
    throw new Error(`expected LogicError ${code}, got ${err}`);
  }
  throw new Error(`expected LogicError ${code}, nothing thrown`);
}

const METHODS = [
  { key: 'efectivo', label: 'Efectivo', is_cash: true, active: true },
  { key: 'tarjeta', label: 'Tarjeta', is_cash: false, active: true },
  { key: 'vales', label: 'Vales', is_cash: false, active: false },
];

Deno.test('validateOpeningFloat / validateCountedCash', () => {
  assertEquals(validateOpeningFloat(50000), 50000);
  assertEquals(validateOpeningFloat(0), 0);
  assertCode(() => validateOpeningFloat(-1), 'invalid_opening_float');
  assertCode(() => validateOpeningFloat(10.5), 'invalid_opening_float');
  assertCode(() => validateOpeningFloat('100'), 'invalid_opening_float');
  assertEquals(validateCountedCash(0), 0);
  assertCode(() => validateCountedCash(undefined), 'invalid_counted_cash');
  assertCode(() => validateCountedCash(-5), 'invalid_counted_cash');
});

Deno.test('validateCashOut: positive amount, reason and key required', () => {
  assertEquals(validateCashOut({ amount: 15000, reason: '  Hielo ', idempotency_key: 'k1' }), {
    amount: 15000,
    reason: 'Hielo',
    idempotency_key: 'k1',
  });
  assertCode(() => validateCashOut({ amount: 0, reason: 'x', idempotency_key: 'k' }), 'invalid_amount');
  assertCode(() => validateCashOut({ amount: -100, reason: 'x', idempotency_key: 'k' }), 'invalid_amount');
  assertCode(() => validateCashOut({ amount: 1.5, reason: 'x', idempotency_key: 'k' }), 'invalid_amount');
  assertCode(() => validateCashOut({ amount: 100, reason: '   ', idempotency_key: 'k' }), 'reason_required');
  assertCode(() => validateCashOut({ amount: 100, reason: 'x'.repeat(201), idempotency_key: 'k' }), 'reason_too_long');
  assertCode(() => validateCashOut({ amount: 100, reason: 'x', idempotency_key: '' }), 'idempotency_key_required');
});

Deno.test('normalizeComment / requiresComment', () => {
  assertEquals(normalizeComment(undefined), '');
  assertEquals(normalizeComment('  falto cambio '), 'falto cambio');
  assertCode(() => normalizeComment(42), 'invalid_comment');
  assertCode(() => normalizeComment('x'.repeat(501)), 'comment_too_long');
  assertEquals(requiresComment(0, ''), false);
  assertEquals(requiresComment(-500, ''), true);
  assertEquals(requiresComment(500, '   '), true);
  assertEquals(requiresComment(500, 'propina en efectivo'), false);
});

Deno.test('cashMethodKeys: from methods, falls back to efectivo', () => {
  assertEquals([...cashMethodKeys(METHODS)], ['efectivo']);
  assertEquals([...cashMethodKeys([])], ['efectivo']);
  assertEquals([...cashMethodKeys(null)], ['efectivo']);
  assertEquals([...cashMethodKeys([{ key: 'caja', label: 'Caja', is_cash: true }])], ['caja']);
});

Deno.test('computeExpectedCash: float + live cash payments + (negative) cash outs', () => {
  const r = computeExpectedCash({
    opening_float: 50000,
    payments: [
      { method: 'efectivo', amount: 30000 },
      { method: 'efectivo', amount: 12000, voided_at: '2026-09-28T20:00:00.000Z' }, // voided: ignored
      { method: 'tarjeta', amount: 99900 }, // not cash: ignored
      { method: 'efectivo', amount: 5050 },
    ],
    cashKeys: new Set(['efectivo']),
    cashMovements: [{ amount: -10000 }, { amount: -2500 }],
  });
  assertEquals(r, { expected_cash: 50000 + 35050 - 12500, cash_sales: 35050, cash_outs_total: 12500 });
});

Deno.test('computeExpectedCash: empty shift is just the float', () => {
  const r = computeExpectedCash({ opening_float: 20000, payments: [], cashKeys: new Set(['efectivo']), cashMovements: [] });
  assertEquals(r.expected_cash, 20000);
});

Deno.test('salesByMethod: groups live payments, label from payment then methods, biggest first', () => {
  const r = salesByMethod(
    [
      { method: 'tarjeta', method_label: 'Tarjeta', amount: 20000 },
      { method: 'efectivo', amount: 5000 },
      { method: 'efectivo', amount: 7000 },
      { method: 'efectivo', amount: 9999, voided_at: 'x' },
      { method: 'vales', method_label: 'Vales de despensa', amount: 1000 },
    ],
    METHODS
  );
  assertEquals(r, [
    { key: 'tarjeta', label: 'Tarjeta', is_cash: false, amount: 20000, count: 1 },
    { key: 'efectivo', label: 'Efectivo', is_cash: true, amount: 12000, count: 2 },
    { key: 'vales', label: 'Vales de despensa', is_cash: false, amount: 1000, count: 1 },
  ]);
});

function sampleSummary(counted = 78550, comment = '') {
  return buildSummary({
    opening_float: 50000,
    payments: [
      { method: 'efectivo', amount: 40000 },
      { method: 'efectivo', amount: 5050 },
      { method: 'tarjeta', amount: 60000 },
    ],
    methods: METHODS,
    paidOrders: [
      { status: 'cobrada', tip: 5000, discount: 0, total: 45050 },
      { status: 'cobrada', tip: 0, discount: 3000, discount_kind: 'descuento', total: 40000 },
      { status: 'cobrada', tip: 1000, discount: 20000, discount_kind: 'cortesia', total: 1000 },
      { status: 'abierta', tip: 777, discount: 1, total: 1 }, // not paid: ignored
    ],
    cancelledItems: 4,
    cashMovements: [{ amount: -15000, reason: 'Hielo', created_by: 'ana@bar.mx', created_date: '2026-09-28T21:00:00.000Z' }],
    counted_cash: counted,
    comment,
  });
}

Deno.test('buildSummary: freezes sales, tips, discounts, cancellations, cash', () => {
  const s = sampleSummary();
  assertEquals(s.sales_total, 105050);
  assertEquals(s.tips, 6000);
  assertEquals(s.discounts, { count: 1, amount: 3000 });
  assertEquals(s.courtesies, { count: 1, amount: 20000 });
  assertEquals(s.cancelled_items, 4);
  assertEquals(s.orders_paid, 3);
  assertEquals(s.avg_ticket, Math.round(105050 / 3));
  assertEquals(s.opening_float, 50000);
  assertEquals(s.cash_sales, 45050);
  assertEquals(s.cash_outs_total, 15000);
  assertEquals(s.cash_outs.length, 1);
  assertEquals(s.cash_outs[0].amount, 15000); // positive in the summary
  assertEquals(s.expected_cash, 50000 + 45050 - 15000);
  assertEquals(s.counted_cash, 78550);
  assertEquals(s.difference, 78550 - 80050);
});

Deno.test('buildSummary: counted after the fact decides the difference only', () => {
  const exact = sampleSummary(80050);
  assertEquals(exact.difference, 0);
  assertEquals(exact.expected_cash, 80050);
  const over = sampleSummary(81000);
  assertEquals(over.expected_cash, 80050); // expected never depends on counted
  assertEquals(over.difference, 950);
});

Deno.test('buildSummary: no sales, no orders', () => {
  const s = buildSummary({
    opening_float: 0,
    payments: [],
    methods: METHODS,
    paidOrders: [],
    cancelledItems: 0,
    cashMovements: [],
    counted_cash: 0,
    comment: '',
  });
  assertEquals(s.sales_total, 0);
  assertEquals(s.avg_ticket, 0);
  assertEquals(s.difference, 0);
});

Deno.test('redactShift: numbers only with Turno:ver_corte', () => {
  const shift = { id: 's1', counted_cash: 100, expected_cash: 200, difference: -100, summary: { a: 1 }, email_status: 'enviado' };
  assertEquals(redactShift(shift, true), shift);
  assertEquals(redactShift(shift, false), { id: 's1', counted_cash: 100, email_status: 'enviado' });
});

Deno.test('fmtMoney', () => {
  assertEquals(fmtMoney(0), '$0.00');
  assertEquals(fmtMoney(123456), '$1,234.56');
  assertEquals(fmtMoney(-1230), '-$12.30');
  assertEquals(fmtMoney(100000000), '$1,000,000.00');
  assertEquals(fmtMoney(5), '$0.05');
});

Deno.test('formatLocalDateTime: UTC-6', () => {
  assertEquals(formatLocalDateTime('2026-09-29T03:30:00.000Z', BAR_UTC_OFFSET_MIN), '2026-09-28 21:30');
  assertEquals(formatLocalDateTime('garbage', BAR_UTC_OFFSET_MIN), '');
});

const META = {
  bar_name: 'Vindima',
  opened_at: '2026-09-28T13:00:00.000Z', // 07:00 local
  closed_at: '2026-09-29T04:30:00.000Z', // 22:30 local, still 2026-09-28
  opened_by: 'ana@bar.mx',
  closed_by: 'luis@bar.mx',
};

// The corte is read on a phone at closing time. Base44 renders the body as
// HTML (a plain-text body arrived as one run-on paragraph), so these assert
// on real markup: the cash verdict first, every figure present, typed text
// escaped, and never a cost/utility word (D7).
const textOf = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

Deno.test('buildCorteEmail: HTML, verdict first, figures, comment; no cost words', () => {
  const summary = sampleSummary(78550, 'Faltó cambio');
  const { subject, body } = buildCorteEmail(META, summary, BAR_UTC_OFFSET_MIN);
  assertEquals(subject, 'Corte de caja · Vindima · 2026-09-28');
  if (!body.startsWith('<!doctype html>')) throw new Error('body must be an HTML document');
  const text = textOf(body);
  const has = (t: string) => {
    if (!text.includes(t)) throw new Error(`body should include "${t}"\n${text}`);
  };
  has('28/09/2026 · Turno de 07:00 a 22:30');
  has('Faltan $15.00');
  has('Esperado $800.50 · Contado $785.50');
  has('Efectivo · 2 $450.50');
  has('Tarjeta · 1 $600.00');
  has('Total vendido $1,050.50');
  has('Propinas $60.00');
  has('Cortesías · 1 $200.00');
  has('Hielo $150.00');
  has('Esperado en caja $800.50');
  has('Contado $785.50');
  has('“Faltó cambio”');
  has('Abrió ana@bar.mx');
  has('Sommel · by ACACIA Consultoría');
  if (text.indexOf('Faltan $15.00') > text.indexOf('Ventas por forma de pago')) {
    throw new Error('the cash verdict must come before the sales breakdown');
  }
  const lower = text.toLowerCase();
  for (const bad of ['costo', 'utilidad', 'margen', '—']) {
    if (lower.includes(bad)) throw new Error(`body must not contain "${bad}"`);
  }
});

Deno.test('buildCorteEmail: no sales / no cash outs / cuadra', () => {
  const summary = buildSummary({
    opening_float: 10000,
    payments: [],
    methods: METHODS,
    paidOrders: [],
    cancelledItems: 0,
    cashMovements: [],
    counted_cash: 10000,
    comment: '',
  });
  const text = textOf(buildCorteEmail(META, summary, BAR_UTC_OFFSET_MIN).body);
  for (const t of ['La caja cuadra', 'Sin ventas en el turno', 'Salidas de efectivo Ninguna']) {
    if (!text.includes(t)) throw new Error(`body should include "${t}"\n${text}`);
  }
  if (text.includes('“')) throw new Error('no comment block expected');
});

// A cash-out reason or comment is typed by staff; it must not become markup
// in the owner's inbox.
Deno.test('buildCorteEmail: typed text is escaped', () => {
  const summary = sampleSummary(78550, '<b>ojo</b> & "listo"');
  summary.cash_outs = [{ amount: 100, reason: '<img src=x onerror=alert(1)>', created_by: 'x' } as any];
  const { body } = buildCorteEmail({ ...META, bar_name: 'Bar <script>' }, summary, BAR_UTC_OFFSET_MIN);
  for (const bad of ['<b>ojo', '<img src=x', '<script>']) {
    if (body.includes(bad)) throw new Error(`unescaped "${bad}" in body`);
  }
  if (!body.includes('&lt;b&gt;ojo&lt;/b&gt; &amp; &quot;listo&quot;')) throw new Error('comment not escaped as expected');
});

Deno.test('cashVerdict: cuadra / faltan / sobran', () => {
  assertEquals(cashVerdict(0).title, 'La caja cuadra');
  assertEquals(cashVerdict(-1500).title, 'Faltan $15.00');
  assertEquals(cashVerdict(2000).title, 'Sobran $20.00');
});

Deno.test('wrapText: wraps on words, hard-cuts long words', () => {
  assertEquals(wrapText('uno dos tres', 7), ['uno dos', 'tres']);
  assertEquals(wrapText('abcdefghij', 4), ['abcd', 'efgh', 'ij']);
  assertEquals(wrapText('', 10), []);
});

Deno.test('buildCorteLines: every line fits 32 columns, structure is right', () => {
  const summary = sampleSummary(78550, 'Faltó cambio en la barra durante la noche de sábado');
  const lines = buildCorteLines(META, summary, BAR_UTC_OFFSET_MIN, padLine);
  for (const l of lines) {
    if (l.text.length > 32) throw new Error(`line too long (${l.text.length}): "${l.text}"`);
  }
  assertEquals(lines[0], { text: 'Vindima', align: 'center', bold: true });
  assertEquals(lines[1].text, 'CORTE DE CAJA');
  const texts = lines.map((l) => l.text);
  if (!texts.includes('-'.repeat(32))) throw new Error('missing separator');
  const total = lines.find((l) => l.text.startsWith('TOTAL'));
  assertEquals(total?.text.length, 32);
  assertEquals(total?.text.endsWith('$1,050.50'), true);
  const diff = lines.find((l) => l.text.startsWith('Faltante'));
  assertEquals(diff?.text.endsWith('-$15.00'), true);
  assertEquals(texts.some((t) => t.startsWith('Comentario:')), true);
  for (const l of lines) for (const bad of ['costo', 'utilidad', '—']) {
    if (l.text.toLowerCase().includes(bad)) throw new Error(`line must not contain ${bad}`);
  }
});

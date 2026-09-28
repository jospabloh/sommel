// Deno tests for base44/functions/settings/handlers/_logic.ts (zero imports).
//   deno test --allow-env base44/tests/settings_logic_test.ts
import {
  LogicError,
  buildSettingsPatch,
  slugifyKey,
  validateEmails,
  validatePaymentMethods,
  type PaymentMethod,
} from '../functions/settings/handlers/_logic.ts';

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

const DEFAULTS: PaymentMethod[] = [
  { key: 'efectivo', label: 'Efectivo', is_cash: true, active: true },
  { key: 'tarjeta', label: 'Tarjeta', is_cash: false, active: true },
];

Deno.test('slugifyKey: accents and spaces', () => {
  assertEquals(slugifyKey('Vales de Despensa'), 'vales_de_despensa');
  assertEquals(slugifyKey('  Crédito  '), 'credito');
});

Deno.test('validateEmails: trims, lowercases, dedupes, skips blanks', () => {
  assertEquals(validateEmails([' A@x.com ', 'a@x.com', '', 'b@y.mx']), ['a@x.com', 'b@y.mx']);
  assertEquals(validateEmails([]), []);
});

Deno.test('validateEmails: invalid and too many', () => {
  assertCode(() => validateEmails(['no-es-correo']), 'invalid_email');
  assertCode(() => validateEmails('a@x.com'), 'invalid_emails');
  assertCode(() => validateEmails(Array.from({ length: 11 }, (_, i) => `u${i}@x.com`)), 'too_many_emails');
});

Deno.test('validatePaymentMethods: adds a method with generated key', () => {
  const out = validatePaymentMethods([...DEFAULTS, { label: 'Vales', is_cash: false, active: true }], DEFAULTS);
  assertEquals(out[2], { key: 'vales', label: 'Vales', is_cash: false, active: true });
});

Deno.test('validatePaymentMethods: duplicate key, no active, no cash', () => {
  assertCode(() => validatePaymentMethods([...DEFAULTS, { key: 'tarjeta', label: 'Otra', is_cash: false, active: true }], DEFAULTS), 'duplicate_method_key');
  assertCode(() => validatePaymentMethods(DEFAULTS.map((m) => ({ ...m, active: false })), DEFAULTS), 'no_active_method');
  assertCode(() => validatePaymentMethods([{ key: 'tarjeta', label: 'Tarjeta', is_cash: false, active: true }], []), 'no_cash_method');
  assertCode(() => validatePaymentMethods([], DEFAULTS), 'invalid_payment_methods');
});

Deno.test('validatePaymentMethods: existing method cannot be removed nor change is_cash', () => {
  assertCode(() => validatePaymentMethods([DEFAULTS[0]], DEFAULTS), 'method_removed');
  assertCode(() => validatePaymentMethods([{ ...DEFAULTS[0], is_cash: false }, DEFAULTS[1], { key: 'x', label: 'X', is_cash: true, active: true }], DEFAULTS), 'cash_flag_locked');
});

Deno.test('validatePaymentMethods: deactivating a method is fine', () => {
  const out = validatePaymentMethods([DEFAULTS[0], { ...DEFAULTS[1], active: false }], DEFAULTS);
  assertEquals(out[1].active, false);
});

Deno.test('buildSettingsPatch: only provided fields, normalized', () => {
  const patch = buildSettingsPatch({ action: 'update', rfc: ' xaxx010101000 ', ticket_footer: ' Gracias ', prep_goal_bar_min: 7.6 }, DEFAULTS);
  assertEquals(patch, { rfc: 'XAXX010101000', ticket_footer: 'Gracias', prep_goal_bar_min: 8 });
});

Deno.test('buildSettingsPatch: rejects name, unknown fields, bad rfc, bad goal, empty', () => {
  assertCode(() => buildSettingsPatch({ name: 'Otro' }, DEFAULTS), 'field_not_editable');
  assertCode(() => buildSettingsPatch({ billing_status: 'active' }, DEFAULTS), 'field_not_editable');
  assertCode(() => buildSettingsPatch({ rfc: '123' }, DEFAULTS), 'invalid_rfc');
  assertCode(() => buildSettingsPatch({ prep_goal_kitchen_min: 0 }, DEFAULTS), 'invalid_prep_goal');
  assertCode(() => buildSettingsPatch({ action: 'update' }, DEFAULTS), 'nothing_to_update');
});

Deno.test('buildSettingsPatch: empty rfc clears it', () => {
  assertEquals(buildSettingsPatch({ rfc: '' }, DEFAULTS), { rfc: '' });
});

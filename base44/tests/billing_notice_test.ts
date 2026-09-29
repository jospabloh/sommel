// Deno tests for src/lib/billingNotice.js (pure, zero imports) — the sentence
// choice behind the persistent license banner in Layout.jsx.
//   deno test --allow-env base44/tests/billing_notice_test.ts
// @ts-ignore: plain JS module shared with the client bundle
import { billingNotice, trialDaysLeft } from '../../src/lib/billingNotice.js';

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg ?? 'assertEquals'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const NOW = new Date('2026-10-01T12:00:00Z');

Deno.test('billingNotice: active, unknown and missing bars show nothing', () => {
  assertEquals(billingNotice({ billing_status: 'active' }, NOW), null);
  assertEquals(billingNotice({ billing_status: 'weird' }, NOW), null);
  assertEquals(billingNotice(null, NOW), null);
  assertEquals(billingNotice({}, NOW), null);
});

Deno.test('billingNotice: suspended is danger, view_only is warning', () => {
  assertEquals(billingNotice({ billing_status: 'suspended' }, NOW)?.tone, 'danger');
  assertEquals(billingNotice({ billing_status: 'view_only' }, NOW)?.tone, 'warning');
  assertEquals(billingNotice({ billing_status: 'suspended' }, NOW)?.kind, 'suspended');
});

Deno.test('billingNotice: trial counts whole days, rounding up', () => {
  assertEquals(trialDaysLeft('2026-10-11T12:00:00Z', NOW), 10);
  assertEquals(trialDaysLeft('2026-10-01T13:00:00Z', NOW), 1);
  assertEquals(trialDaysLeft('garbage', NOW), null);
  assertEquals(trialDaysLeft(null, NOW), null);
  const n = billingNotice({ billing_status: 'trial', trial_end_at: '2026-10-11T12:00:00Z' }, NOW);
  assertEquals(n?.text, 'Te quedan 10 días de prueba.');
  assertEquals(n?.tone, 'info');
});

Deno.test('billingNotice: last days warn, singular day, expired trial says so', () => {
  const one = billingNotice({ billing_status: 'trial', trial_end_at: '2026-10-02T09:00:00Z' }, NOW);
  assertEquals(one?.text, 'Te queda 1 día de prueba.');
  assertEquals(one?.tone, 'warning');
  const gone = billingNotice({ billing_status: 'trial', trial_end_at: '2026-09-20T00:00:00Z' }, NOW);
  assertEquals(gone?.title, 'Tu prueba terminó');
});

Deno.test('billingNotice: trial without a usable date shows nothing rather than a wrong number', () => {
  assertEquals(billingNotice({ billing_status: 'trial', trial_end_at: null }, NOW), null);
});

Deno.test('billingNotice: no em dashes in any user-facing string', () => {
  const all = [
    billingNotice({ billing_status: 'suspended' }, NOW),
    billingNotice({ billing_status: 'view_only' }, NOW),
    billingNotice({ billing_status: 'trial', trial_end_at: '2026-10-11T12:00:00Z' }, NOW),
    billingNotice({ billing_status: 'trial', trial_end_at: '2026-09-01T12:00:00Z' }, NOW),
  ];
  for (const n of all) assertEquals(/—/.test(`${n?.title} ${n?.text}`), false);
});

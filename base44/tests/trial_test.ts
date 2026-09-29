// deno test --allow-env base44/tests/trial_test.ts
import { TRIAL_DAYS, TRIAL_STATUS, buildNewBar, computeTrialEnd } from '../functions/createWineBar/_trial_logic.ts';

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(msg || `expected ${e}, got ${a}`);
}

const T0 = Date.UTC(2026, 8, 29, 12, 0, 0);

Deno.test('the trial lasts 30 days and starts in trial', () => {
  assertEquals(TRIAL_DAYS, 30);
  assertEquals(TRIAL_STATUS, 'trial');
});

Deno.test('computeTrialEnd adds exactly 30 days to now', () => {
  assertEquals(computeTrialEnd(T0), '2026-10-29T12:00:00.000Z');
});

Deno.test('computeTrialEnd honors a custom length and crosses a year', () => {
  assertEquals(computeTrialEnd(Date.UTC(2026, 11, 20), 15), '2027-01-04T00:00:00.000Z');
});

Deno.test('computeTrialEnd defaults to the real clock', () => {
  const before = Date.now();
  const end = Date.parse(computeTrialEnd());
  const after = Date.now();
  const d = TRIAL_DAYS * 86_400_000;
  if (end < before + d || end > after + d) throw new Error('trial end not ~30 days from now');
});

Deno.test('buildNewBar writes trial status, trial end and owner', () => {
  assertEquals(buildNewBar({ name: 'Vindima', address: 'Centro', ownerId: 'u1', now: T0 }), {
    name: 'Vindima',
    address: 'Centro',
    billing_status: 'trial',
    trial_end_at: '2026-10-29T12:00:00.000Z',
    owner_id: 'u1',
  });
});

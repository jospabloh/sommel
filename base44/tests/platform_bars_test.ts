// deno test --allow-env base44/tests/platform_bars_test.ts (zero external imports)
import {
  appendAudit,
  AUDIT_MAX_ENTRIES,
  cleanNote,
  diffLicense,
  projectBar,
  validateLicensePatch,
} from '../functions/settings/handlers/_platformLogic.ts';
import { sanitizeLicensePatch } from '../functions/acaciaControl/_bridge_logic.ts';

const eq = (a: unknown, b: unknown, m = '') => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
};

Deno.test('validate: accepts the four license fields, normalizes dates', () => {
  const r = validateLicensePatch({ billing_status: 'active', plan: 'pro', trial_end_at: '2026-10-01T00:00:00Z', current_period_end: null });
  eq(r, { patch: { billing_status: 'active', plan: 'pro', trial_end_at: '2026-10-01T00:00:00.000Z', current_period_end: null } });
});

Deno.test('validate: rejects unknown field, bad status, bad date, long plan, empty, non-object', () => {
  for (const p of [{ name: 'x' }, { billing_status: 'gone' }, { trial_end_at: 'nope' }, { plan: 'x'.repeat(61) }, {}, null, [], 'x']) {
    if (!('error' in validateLicensePatch(p))) throw new Error(`accepted ${JSON.stringify(p)}`);
  }
});

Deno.test('validate: agrees with acaciaControl sanitizeLicensePatch on accept/reject', () => {
  const cases: unknown[] = [
    { billing_status: 'suspended' }, { billing_status: 'bogus' }, { plan: null }, { plan: 5 },
    { trial_end_at: '2026-01-01' }, { trial_end_at: 'x' }, { owner_id: 'u' }, {},
  ];
  for (const c of cases) {
    const a = 'error' in validateLicensePatch(c);
    const b = 'error' in sanitizeLicensePatch(c);
    if (a !== b) throw new Error(`divergence on ${JSON.stringify(c)}`);
    if (!a) eq((validateLicensePatch(c) as any).patch, (sanitizeLicensePatch(c) as any).patch);
  }
});

Deno.test('diff: only changed fields; no-op is null; date compared as instant', () => {
  const bar = { billing_status: 'trial', plan: null, trial_end_at: '2026-10-01T00:00:00.000Z' };
  eq(diffLicense(bar, { billing_status: 'active', plan: null }), { before: { billing_status: 'trial' }, after: { billing_status: 'active' } });
  eq(diffLicense(bar, { trial_end_at: '2026-10-01T00:00:00.000Z' }), null);
  eq(diffLicense(bar, { plan: 'pro' }), { before: { plan: null }, after: { plan: 'pro' } });
});

Deno.test('audit: appends, caps at newest, note trimmed and clipped', () => {
  const e = { by: 'a', at: 't', before: {}, after: {}, note: '' };
  eq(appendAudit(undefined, e).length, 1);
  let list: any[] = [];
  for (let i = 0; i < AUDIT_MAX_ENTRIES + 5; i++) list = appendAudit(list, { ...e, note: String(i) });
  eq(list.length, AUDIT_MAX_ENTRIES);
  eq(list[list.length - 1].note, String(AUDIT_MAX_ENTRIES + 4));
  eq(cleanNote('  hola  '), 'hola');
  eq(cleanNote('x'.repeat(400)).length, 300);
  eq(cleanNote(5), '');
});

Deno.test('projectBar: exposes only the panel slice', () => {
  const p = projectBar({ id: '1', name: 'B', rfc: 'SECRET', owner_id: 'o', license_audit: [{ note: 'n' }] }, { products: 2, orders: 3, revenue_cents: 500 });
  eq(Object.keys(p).includes('rfc'), false);
  eq(Object.keys(p).includes('owner_id'), false);
  eq(p.billing_status, 'trial');
  eq(p.last_license_change, { note: 'n' });
});

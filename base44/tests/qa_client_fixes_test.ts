import { menuViewState } from '../../src/lib/menuViewState.js';
import { buildTenantPull, MC_APP_ID, TENANT_PULL_URL } from '../functions/createWineBar/_trial_logic.ts';
import { inviteLink } from '../functions/manageStaff/_invite_email.ts';

function assertEquals(actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`expected ${e}, got ${a}`);
}

Deno.test('menu: a failed load is an error, never the empty state', () => {
  assertEquals(menuViewState({ loadError: 'Error de red', categoryCount: 0 }), 'error');
  assertEquals(menuViewState({ loadError: null, categoryCount: 0 }), 'empty');
  assertEquals(menuViewState({ loadError: null, categoryCount: 3 }), 'list');
});

Deno.test('createWineBar pings Mission Control tenant-pull with {app, tenantId}', () => {
  const ping = buildTenantPull('6a750a5d84dcc1b5f5e39eb5');
  assertEquals(ping.url, TENANT_PULL_URL);
  assertEquals(TENANT_PULL_URL.endsWith('/api/ingest/tenant-pull'), true);
  assertEquals(JSON.parse(ping.body), { app: MC_APP_ID, tenantId: '6a750a5d84dcc1b5f5e39eb5' });
  assertEquals(MC_APP_ID, 'sommel');
});

Deno.test('invite link to share when the email fails', () => {
  assertEquals(inviteLink(false, 'a+b@x.com'), 'https://sommel.acaciaco.com.mx/register?email=a%2Bb%40x.com');
  assertEquals(inviteLink(true, 'a@x.com'), 'https://sommel.acaciaco.com.mx/login');
});

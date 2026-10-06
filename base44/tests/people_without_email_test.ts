// People without email (phase 2b, 2026-10-06): an account with no mailbox that
// only unlocks terminals. Each test names what a real bar would hit.
import {
  PERSON_EMAIL_DOMAIN,
  TERMINAL_EMAIL_DOMAIN,
  isInternalPersonEmail,
  personEmail,
  validateNewPin,
  validatePersonName,
  validatePersonRole,
} from '../functions/terminals/_terminal_logic.ts';
import { barContacts, isNoMailboxEmail } from '../functions/acaciaControl/_bridge_logic.ts';
// @ts-ignore: plain JS modules, the same files the client imports.
import { PERSON_EMAIL_DOMAIN as CLIENT_DOMAIN, isWithoutEmail } from '../../src/lib/rbac.js';
// @ts-ignore: plain JS module.
import { pinProblem } from '../../src/components/staff/pinRules.js';

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg ?? 'assertEquals'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function assertThrowsCode(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (err) {
    if ((err as { code?: string }).code === code) return;
    throw err;
  }
  throw new Error(`expected ${code}`);
}

Deno.test('client and server agree on which accounts have no email', () => {
  assertEquals(CLIENT_DOMAIN, PERSON_EMAIL_DOMAIN);
  const email = personEmail('abc123');
  assertEquals(isInternalPersonEmail(email), true);
  assertEquals(isWithoutEmail({ email }), true);
  // A real person and a terminal are not "without email" people.
  assertEquals(isInternalPersonEmail('ana@gmail.com'), false);
  assertEquals(isInternalPersonEmail(`t-1@${TERMINAL_EMAIL_DOMAIN}`), false);
  assertEquals(isWithoutEmail({ email: 'ana@gmail.com' }), false);
});

Deno.test('the admin can only add bar roles: never a terminal or the platform', () => {
  assertEquals(validatePersonRole(undefined), 'staff');
  assertEquals(validatePersonRole('bar_admin'), 'bar_admin');
  assertThrowsCode(() => validatePersonRole('terminal'), 'invalid_role');
  assertThrowsCode(() => validatePersonRole('admin'), 'invalid_role');
  assertThrowsCode(() => validatePersonRole('super_admin'), 'invalid_role');
});

Deno.test('a name and a PIN are required, with the same PIN rule as the checador', () => {
  assertEquals(validatePersonName('  Ana   López '), 'Ana López');
  assertThrowsCode(() => validatePersonName('   '), 'invalid_name');
  assertThrowsCode(() => validatePersonName('x'.repeat(41)), 'invalid_name');
  assertEquals(validateNewPin('1234'), '1234');
  assertThrowsCode(() => validateNewPin('12a4'), 'invalid_pin');
  assertThrowsCode(() => validateNewPin('123'), 'invalid_pin');
  assertEquals(pinProblem('1234', '1234'), null);
  assertEquals(pinProblem('1234', '1235'), 'Los dos PIN no coinciden');
  assertEquals(pinProblem('12', '12'), 'El PIN debe tener de 4 a 6 números');
});

Deno.test('Mission Control never mails a bar at an address with no mailbox', () => {
  const bar = { id: 'b1', name: 'Bar', owner_id: 'p1' };
  const users = [
    { id: 'p1', tenant_id: 'b1', app_role: 'bar_admin', email: personEmail('x1'), created_date: '2026-01-01' },
    { id: 'a2', tenant_id: 'b1', app_role: 'bar_admin', email: 'dueno@bar.mx', created_date: '2026-02-01' },
  ];
  assertEquals(barContacts([bar], users)[0].email, 'dueno@bar.mx', 'owner without email is skipped');
  assertEquals(barContacts([bar], [users[0]])[0].email, null, 'no contact rather than a dead address');
  assertEquals(isNoMailboxEmail(`t-9@${TERMINAL_EMAIL_DOMAIN}`), true);
});

// Sommel's own name for a person (User.display_name): Base44 never lets an
// account change full_name after signup, so every screen and every "who did
// it" uses this order. The rule lives in four places that cannot import each
// other; this pins them together.
import { normalizeDisplayName as guardNormalize, personName as guardName } from '../../scripts/templates/_guard_logic.ts';
import { normalizeDisplayName as staffNormalize, personName as staffName } from '../functions/manageStaff/_member_logic.ts';
import { normalizeDisplayName as barNormalize } from '../functions/createWineBar/_trial_logic.ts';
import { displayName as attendanceName } from '../functions/attendance/handlers/_logic.ts';
import { displayName as terminalName } from '../functions/terminals/_terminal_logic.ts';
import { authorName } from '../functions/support/handlers/_logic.ts';
// @ts-ignore: plain JS module, the same file the client imports.
import { personName as clientName } from '../../src/lib/rbac.js';

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg ?? 'assertEquals'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const named = { display_name: 'Karla Ruiz', full_name: 'karla.r', email: 'karla@bar.mx' };
const googleOnly = { display_name: '', full_name: 'Luis Pérez', email: 'luis@bar.mx' };
const bare = { email: 'ana.lopez@bar.mx' };

Deno.test('the name the admin set wins over the account name everywhere', () => {
  for (const [label, fn] of [['guard', guardName], ['staff', staffName], ['attendance', attendanceName], ['terminal', terminalName], ['support', authorName], ['client', clientName]] as const) {
    assertEquals((fn as (u: unknown) => string)(named), 'Karla Ruiz', label);
    assertEquals((fn as (u: unknown) => string)(googleOnly), 'Luis Pérez', label);
  }
});

Deno.test('with no name at all the server shows the part before the @, never the whole email', () => {
  for (const fn of [guardName, staffName, attendanceName, terminalName, authorName]) {
    assertEquals((fn as (u: unknown) => string)(bare), 'ana.lopez');
  }
});

Deno.test('a name is trimmed, single-spaced, 1 to 60 characters, with no control characters', () => {
  for (const fn of [guardNormalize, staffNormalize, barNormalize]) {
    assertEquals(fn('  Karla   Ruiz '), 'Karla Ruiz');
    assertEquals(fn('Ka\u0000rla'), 'Karla');
    assertEquals(fn('   '), null);
    assertEquals(fn('x'.repeat(61)), null);
    assertEquals(fn(42), null);
  }
});

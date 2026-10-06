// What the app treats as "the user" on a terminal (src/lib/terminal/terminalUser.js).
// @ts-ignore: plain JS module, the same file the client imports.
import { effectiveUser, isTerminalAccount } from '../../src/lib/terminal/terminalUser.js';

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg ?? 'assertEquals'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const account = { id: 't1', full_name: 'Terminal Caja', app_role: 'terminal', tenant_id: 'bar1', role: 'user' };

Deno.test('a locked terminal is the bare terminal account, which has no bar role', () => {
  assertEquals(effectiveUser(account, { person: null }), account);
  assertEquals(isTerminalAccount(account), true);
});

Deno.test('unlocked, every screen works as the person: their role, the terminal bar, never the platform', () => {
  const u = effectiveUser(account, { person: { id: 'p1', name: 'Ana', app_role: 'staff' } });
  assertEquals([u.id, u.app_role, u.tenant_id, u.role, u.terminal.name], ['p1', 'staff', 'bar1', 'user', 'Caja']);
});

Deno.test('a normal sign-in is never rewritten, even if a stale terminal state lingers', () => {
  const admin = { id: 'a1', app_role: 'bar_admin', tenant_id: 'bar1', role: 'user' };
  assertEquals(effectiveUser(admin, { person: { id: 'p1', name: 'Ana', app_role: 'staff' } }), admin);
  assertEquals(effectiveUser(null, { person: null }), null);
});

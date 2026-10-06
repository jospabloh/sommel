// How the app sees a terminal (docs/modo-terminal-diseno.md). Pure, so it is
// easy to test: base44/tests/terminal_user_test.ts.
export const TERMINAL_ROLE = 'terminal';

export const isTerminalAccount = (user) => user?.app_role === TERMINAL_ROLE;

/**
 * The user every screen works with. On a terminal that somebody unlocked it
 * is THAT person (their role, so their permissions), inside the terminal's
 * bar; locked, it is the bare terminal account, which has no permissions.
 * Anyone else is unchanged.
 */
export function effectiveUser(account, terminal) {
  if (!isTerminalAccount(account)) return account;
  const person = terminal?.person;
  if (!person) return account;
  return {
    id: person.id,
    full_name: person.name,
    email: person.email ?? '',
    role: 'user', // never the platform from a terminal
    app_role: person.app_role,
    tenant_id: account.tenant_id,
    terminal: { account_id: account.id, name: String(account.full_name || '').replace(/^Terminal\s+/, '') },
  };
}

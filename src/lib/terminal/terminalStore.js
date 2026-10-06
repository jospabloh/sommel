// Terminal mode (docs/modo-terminal-diseno.md): who unlocked this terminal.
// Memory only, on purpose: a reload or a closed tab asks for the PIN again,
// and nothing about the person survives in storage on a shared device.
// The server re-checks every pass; this store only decides what to show.
let state = { pass: null, expiresAt: null, person: null, revoked: false };
const listeners = new Set();

function emit() {
  for (const fn of listeners) fn();
}

export function getTerminalState() {
  return state;
}

export function subscribeTerminal(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** After unlock or renew: `{ pass, expires_at, person: { id, name, app_role } }`. */
export function setUnlocked({ pass, expires_at, person }) {
  state = { pass, expiresAt: expires_at, person, revoked: false };
  emit();
}

/** "Cambiar usuario", the 2-minute lock, an expired pass. */
export function lockTerminal() {
  if (!state.pass && !state.person) return;
  state = { ...state, pass: null, expiresAt: null, person: null };
  emit();
}

/** The admin revoked this device: it shows that, and nothing else works. */
export function markRevoked() {
  state = { pass: null, expiresAt: null, person: null, revoked: true };
  emit();
}

export function currentPass() {
  return state.pass;
}

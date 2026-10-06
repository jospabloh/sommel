// PIN typed on the admin's screen for someone without email. Same rule as the
// server (validateNewPin in terminals/_terminal_logic.ts): 4 to 6 digits.
export function pinProblem(pin, repeat) {
  if (!/^\d{4,6}$/.test(String(pin ?? ''))) return 'El PIN debe tener de 4 a 6 números';
  if (pin !== repeat) return 'Los dos PIN no coinciden';
  return null;
}

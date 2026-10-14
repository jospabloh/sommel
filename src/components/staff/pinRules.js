// PIN typed on the admin's screen for someone without email. Same rule as the
// server (validateNewPin in terminals/_terminal_logic.ts): exactly the bar PIN length.
export function pinProblem(pin, repeat, length = 4) {
  const v = String(pin ?? '');
  if (!/^\d+$/.test(v) || v.length !== length) return `El PIN debe tener ${length} números`;
  if (pin !== repeat) return 'Los dos PIN no coinciden';
  return null;
}

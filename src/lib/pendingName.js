// "Tu nombre" at signup. Base44's register() takes no name and never lets
// full_name change later, so the name waits here (per email, this browser)
// until the person gets a bar: createWineBar or claimInvite stores it once
// as User.display_name. Best effort: blocked storage just skips it, and the
// bar admin can always set the name from Staff.
const KEY = 'sommel-pending-name';

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') || {};
  } catch {
    return {};
  }
}

export function savePendingName(email, name) {
  const e = String(email || '').trim().toLowerCase();
  const n = String(name || '').trim();
  if (!e || !n) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...readAll(), [e]: n }));
  } catch {
    // storage blocked
  }
}

export function readPendingName(email) {
  return readAll()[String(email || '').trim().toLowerCase()] || '';
}

export function clearPendingName(email) {
  const all = readAll();
  delete all[String(email || '').trim().toLowerCase()];
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // storage blocked
  }
}

// Chrome and Edge fire `beforeinstallprompt` once, often before the signed-in
// layout mounts (on /login). Imported from main.jsx so the event is caught
// whichever screen is open, and kept here until someone presses
// "Instalar Sommel".
let deferred = null;
const listeners = new Set();

function emit() {
  for (const fn of listeners) fn(deferred);
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // we show our own button instead of the mini-infobar
    deferred = e;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    emit();
  });
}

export function getInstallPrompt() {
  return deferred;
}

export function onInstallPromptChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Opens the browser's install dialog. Resolves to 'accepted' | 'dismissed' | null. */
export async function runInstallPrompt() {
  const e = deferred;
  if (!e) return null;
  deferred = null; // a prompt can only be used once
  emit();
  try {
    await e.prompt();
    const choice = await e.userChoice;
    return choice?.outcome ?? null;
  } catch {
    return null;
  }
}

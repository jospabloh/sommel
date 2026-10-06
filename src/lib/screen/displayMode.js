// Pure checks for the "Pantalla completa" and "Instalar Sommel" controls.
// Import-free on purpose: base44/tests/display_mode_test.ts loads this file.

/** True when Sommel runs as an installed app (its own window, no address bar). */
export function isStandalone(win) {
  if (!win) return false;
  if (win.navigator?.standalone === true) return true; // iOS home screen
  const mm = typeof win.matchMedia === 'function' ? win.matchMedia.bind(win) : null;
  if (!mm) return false;
  return ['standalone', 'fullscreen', 'minimal-ui'].some((m) => mm(`(display-mode: ${m})`).matches);
}

/** The page can hide the browser's bars on request (Chrome, Edge, desktop Safari). */
export function fullscreenSupported(doc) {
  const el = doc?.documentElement;
  return !!(el && (el.requestFullscreen || el.webkitRequestFullscreen) && doc.fullscreenEnabled !== false);
}

export function isFullscreen(doc) {
  return !!(doc?.fullscreenElement || doc?.webkitFullscreenElement);
}

/** iPhone and iPad (iPadOS reports itself as a Mac with touch). Safari there
 *  never offers an install prompt; the person adds Sommel from Compartir. */
export function isIos(nav) {
  if (!nav) return false;
  const ua = String(nav.userAgent || '');
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return /Macintosh/.test(ua) && Number(nav.maxTouchPoints) > 1;
}

/**
 * Which install control to show: 'prompt' (the browser can install it with
 * one click), 'ios' (show how to add it to the home screen) or null (already
 * installed, or this browser cannot install it).
 */
export function installMode({ standalone, hasPrompt, ios }) {
  if (standalone) return null;
  if (hasPrompt) return 'prompt';
  if (ios) return 'ios';
  return null;
}

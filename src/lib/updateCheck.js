// Pure helpers for AppUpdateBanner (module 21), kept out of the component file
// so react-refresh stays happy and a test can import them with no DOM.
export const ENTRY_RE = /\/assets\/index-[A-Za-z0-9_-]+\.js/;

/** Entry bundle path (e.g. /assets/index-abc123.js) in an HTML string, or null. */
export function entryBundleFrom(html) {
  const m = /<script[^>]+type=["']module["'][^>]*src=["']([^"']+)["']/i.exec(html ?? '');
  if (!m) return null;
  const found = m[1].match(ENTRY_RE);
  return found ? found[0] : null;
}

/** True when `latest` is a real bundle path that differs from the running one. */
export function isNewerBuild(running, latest) {
  return Boolean(running && latest && running !== latest);
}

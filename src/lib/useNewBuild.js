// Is a newer Sommel build live than the one this tab loaded? (module 21)
// Used by the terminal lock screen, which reloads itself when this turns true.
// The in-app notice is UpdateBanner (module 30, mounted in main.jsx); the lock
// screen is outside Layout, and a terminal left locked all day kept running
// the build it opened with (2026-10-13, José saw the old 6-dot PIN pad after
// the new one was published).
import { useCallback, useEffect, useRef, useState } from 'react';
import { ENTRY_RE, entryBundleFrom, isNewerBuild } from '@/lib/updateCheck';

export const CHECK_EVERY_MS = 5 * 60 * 1000;

function loadedBundle() {
  const el = Array.from(document.querySelectorAll('script[type="module"][src]')).find((s) => ENTRY_RE.test(s.getAttribute('src') || ''));
  return el ? (el.getAttribute('src').match(ENTRY_RE) || [null])[0] : null;
}

/** The newer entry bundle path, or null while this tab is current. */
export function useNewBuild() {
  const [fresh, setFresh] = useState(null);
  const running = useRef(loadedBundle());

  const check = useCallback(async () => {
    if (!running.current) return; // dev server or unhashed build: nothing to compare
    try {
      const res = await fetch('/index.html', { cache: 'no-store', headers: { accept: 'text/html' } });
      if (!res.ok) return;
      const latest = entryBundleFrom(await res.text());
      if (isNewerBuild(running.current, latest)) setFresh(latest);
    } catch {
      /* offline or blocked: try again next time */
    }
  }, []);

  useEffect(() => {
    if (!running.current) return undefined;
    const timer = setInterval(check, CHECK_EVERY_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [check]);

  return fresh;
}

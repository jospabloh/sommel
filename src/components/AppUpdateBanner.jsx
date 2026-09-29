// Update-available banner (module 21). Mounted once in Layout.jsx.
//
// How it knows: Vite fingerprints the entry bundle (/assets/index-<hash>.js).
// The page the user has open loaded one hash; the server now serves whatever
// the latest publish produced. Every few minutes (and when the tab regains
// focus) we re-fetch index.html with no-store and compare the two hashes. A
// difference means a newer build is live, so we offer a reload. This needs no
// extra file, no backend call and no build step.
//
// The version shown is APP_VERSION from src/lib/appConfig.js, the same line
// About.jsx renders and package.json is checked against. It is the version
// this tab is running, so the banner never claims a number it cannot know.
//
// Best effort and silent: any failure (offline, blocked, dev server with no
// hashed bundle) renders nothing. It is informational and never blocks work;
// dismissing hides it until the next new build.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { APP_VERSION } from '@/lib/appConfig';
import { ENTRY_RE, entryBundleFrom, isNewerBuild } from '@/lib/updateCheck';

const CHECK_EVERY_MS = 5 * 60 * 1000;

function loadedBundle() {
  const el = Array.from(document.querySelectorAll('script[type="module"][src]')).find((s) => ENTRY_RE.test(s.getAttribute('src') || ''));
  return el ? (el.getAttribute('src').match(ENTRY_RE) || [null])[0] : null;
}

export default function AppUpdateBanner() {
  const [fresh, setFresh] = useState(null); // bundle path of the newer build
  const [dismissed, setDismissed] = useState(null);
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

  if (!fresh || dismissed === fresh) return null;

  return (
    <div
      role="status"
      data-update-banner={fresh}
      className="flex items-center gap-3 border-b border-blue-300 bg-blue-50 px-4 py-2.5 text-sm text-blue-900 dark:border-blue-500/40 dark:bg-blue-950/50 dark:text-blue-200"
    >
      <RefreshCw className="w-4 h-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">Hay una versión nueva de Sommel.</span>{' '}
        Estás usando la {APP_VERSION}. Recarga para actualizar; guarda antes lo que estés haciendo.
      </p>
      <Button size="sm" className="h-9 shrink-0" onClick={() => window.location.reload()}>
        Recargar
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-9 shrink-0"
        onClick={() => setDismissed(fresh)}
        aria-label="Cerrar aviso"
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}

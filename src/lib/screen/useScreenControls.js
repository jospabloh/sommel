import { useCallback, useEffect, useState } from 'react';
import { fullscreenSupported, installMode, isFullscreen, isIos, isStandalone } from './displayMode';
import { getInstallPrompt, onInstallPromptChange, runInstallPrompt } from './installPrompt';

/** State and actions behind the sidebar's "Pantalla completa" and
 *  "Instalar Sommel" buttons. */
export function useScreenControls() {
  const [fullscreen, setFullscreen] = useState(() => isFullscreen(document));
  const [hasPrompt, setHasPrompt] = useState(() => !!getInstallPrompt());
  const [standalone, setStandalone] = useState(() => isStandalone(window));

  useEffect(() => {
    const onFs = () => setFullscreen(isFullscreen(document));
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('webkitfullscreenchange', onFs);
    const off = onInstallPromptChange((p) => {
      setHasPrompt(!!p);
      setStandalone(isStandalone(window));
    });
    const mq = window.matchMedia?.('(display-mode: standalone)');
    const onMode = () => setStandalone(isStandalone(window));
    mq?.addEventListener?.('change', onMode);
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      document.removeEventListener('webkitfullscreenchange', onFs);
      off();
      mq?.removeEventListener?.('change', onMode);
    };
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = document.documentElement;
    try {
      if (isFullscreen(document)) {
        await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      } else {
        await (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
      }
    } catch {
      // The browser refused (no user gesture, or a policy): nothing changes.
    }
  }, []);

  return {
    canFullscreen: fullscreenSupported(document),
    fullscreen,
    toggleFullscreen,
    install: installMode({ standalone, hasPrompt, ios: isIos(navigator) }),
    runInstall: runInstallPrompt,
  };
}

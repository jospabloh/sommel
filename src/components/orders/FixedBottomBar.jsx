// The fixed bar at the foot of Orden.jsx (total, Cobrar, Agregar, Enviar). It
// also tells the corner ThemeSwitcher (module 12) to ride above it: while it
// is mounted it sets data-bottom-bar and --bottom-bar-h on <html>, which
// src/index.css turns into --theme-switcher-bottom. Measured, not guessed, so
// it holds at 390 / tablet / desktop and when the bar's content wraps.
import React, { useEffect, useRef } from 'react';

export default function FixedBottomBar({ children }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const root = document.documentElement;
    const sync = () => root.style.setProperty('--bottom-bar-h', `${el.offsetHeight}px`);
    root.setAttribute('data-bottom-bar', '');
    sync();
    let ro;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(sync);
      ro.observe(el);
    }
    return () => {
      if (ro) ro.disconnect();
      root.removeAttribute('data-bottom-bar');
      root.style.removeProperty('--bottom-bar-h');
    };
  }, []);

  return (
    <div
      ref={ref}
      className="fixed bottom-0 left-20 right-0 lg:left-60 bg-background border-t border-border p-4 space-y-2.5"
    >
      {children}
    </div>
  );
}

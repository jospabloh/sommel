// The fixed bar at the foot of Orden.jsx (total, Cobrar, Agregar, Enviar). It
// also tells the corner ThemeSwitcher (module 12) to ride above it: while it
// is mounted it sets data-bottom-bar and --bottom-bar-h on <html>, which
// src/index.css turns into --theme-switcher-bottom. Measured, not guessed, so
// it holds at 390 / tablet / desktop and when the bar's content wraps.
import React, { useEffect, useRef, useState } from 'react';

// The bar starts where the shell's sidebar ends (module 29): hidden on a phone,
// a 64px rail collapsed, 240px expanded, animated in between. Measured, so it
// follows the collapse control without knowing the shell's widths.
function useSidebarEdge() {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    const aside = document.querySelector('[data-app-shell-sidebar]');
    const sync = () => {
      const r = aside?.getBoundingClientRect();
      setLeft(r && r.width > 0 ? Math.round(r.right) : 0);
    };
    sync();
    let ro;
    if (aside && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(sync);
      ro.observe(aside);
    }
    window.addEventListener('resize', sync);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', sync);
    };
  }, []);
  return left;
}

export default function FixedBottomBar({ children }) {
  const ref = useRef(null);
  const left = useSidebarEdge();

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
      style={{ left }}
      className="fixed bottom-0 right-0 bg-background border-t border-border p-4 space-y-2.5"
    >
      {children}
    </div>
  );
}

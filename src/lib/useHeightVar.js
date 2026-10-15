import { useCallback, useRef } from 'react';

/**
 * Publishes the element's rendered height as a CSS custom property on <html>
 * (e.g. --trial-banner-h: 44px). Used to stack the new-version notice under
 * banners whose height depends on content and width.
 *
 * Returns a callback ref, not a ref object, so the variable is cleared the
 * moment the element leaves the DOM, even when the owning component stays
 * mounted and just renders null (SessionBanner after "dismiss").
 */
export function useHeightVar(name) {
  const observerRef = useRef(null);

  const clear = useCallback(() => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    document.documentElement.style.removeProperty(name);
  }, [name]);

  const ref = useCallback((el) => {
    clear();
    if (!el) return;
    const root = document.documentElement;
    const write = () => root.style.setProperty(name, `${el.offsetHeight}px`);
    write();
    if (typeof ResizeObserver !== 'undefined') {
      observerRef.current = new ResizeObserver(write);
      observerRef.current.observe(el);
    }
  }, [name, clear]);

  // No cleanup effect: React calls the ref with null on unmount, and a new
  // name makes a new callback, which detaches the old one the same way.

  return ref;
}

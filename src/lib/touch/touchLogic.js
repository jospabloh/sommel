// Touch-screen mode (2026-10-13): decisions behind drag-to-scroll and the
// on-screen keyboard. No imports: tested in Deno (base44/tests/touch_mode_test.ts).

export const TOUCH_PREFS_KEY = 'sommel.touch';
// Drag-to-scroll is ON unless this device turned it off (José, 2026-10-13: the
// finger has to scroll the screen without anyone finding a setting first).
export const DEFAULT_TOUCH_PREFS = Object.freeze({ dragScroll: true, keyboard: false });

/** Stored JSON -> prefs. Anything unreadable falls back to everything off. */
export function parseTouchPrefs(raw) {
  try {
    const v = JSON.parse(raw ?? 'null');
    if (!v || typeof v !== 'object') return { ...DEFAULT_TOUCH_PREFS };
    return { dragScroll: v.dragScroll !== false, keyboard: v.keyboard === true };
  } catch {
    return { ...DEFAULT_TOUCH_PREFS };
  }
}

/** A press only becomes a scroll after the finger moved this far (px), so a
 *  tap on a button is still a tap. */
export const DRAG_THRESHOLD_PX = 6;

export function passedDragThreshold(dx, dy, threshold = DRAG_THRESHOLD_PX) {
  return Math.hypot(dx, dy) >= threshold;
}

/** A press only becomes a scroll after this many px. A finger needs more
 *  than a mouse: Chrome claims a native touch pan within its own slop, sends
 *  pointercancel, and drag-to-scroll steps aside before it moves anything. */
export const TOUCH_DRAG_THRESHOLD_PX = 24;

/** Mouse, pen and touch. For a real touch screen whose native scroll works,
 *  the browser's pointercancel ends the drag first; when it does not (a
 *  screen Windows reports as a mouse, or a box that blocks panning), this
 *  is what scrolls. */
export function handlesPointer(pointerType, button) {
  return (pointerType === 'mouse' || pointerType === 'pen' || pointerType === 'touch') && button === 0;
}

export function dragThresholdFor(pointerType) {
  return pointerType === 'touch' ? TOUCH_DRAG_THRESHOLD_PX : DRAG_THRESHOLD_PX;
}

const TEXT_TYPES = new Set(['', 'text', 'search', 'email', 'password', 'tel', 'url', 'number']);

/**
 * Which keyboard an element gets, or null for none.
 * @param {{tag: string, type?: string, inputMode?: string, readOnly?: boolean, disabled?: boolean}} el
 */
export function keyboardFor(el) {
  if (!el || el.readOnly || el.disabled) return null;
  const tag = String(el.tag || '').toLowerCase();
  const mode = String(el.inputMode || '').toLowerCase();
  if (mode === 'none') return null;
  if (tag === 'textarea') return 'text';
  if (tag !== 'input') return null;
  const type = String(el.type || '').toLowerCase();
  if (!TEXT_TYPES.has(type)) return null;
  if (type === 'number' || type === 'tel' || mode === 'numeric' || mode === 'decimal' || mode === 'tel') return 'numeric';
  return 'text';
}

/** Drag-to-scroll leaves text fields alone, so a drag inside one still
 *  selects text instead of scrolling the page. */
export function blocksDrag(el) {
  return keyboardFor(el) !== null || String(el?.tag || '').toLowerCase() === 'select';
}

const ACCENTS = { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú', A: 'Á', E: 'É', I: 'Í', O: 'Ó', U: 'Ú' };

/** After the "´" key, a vowel comes out accented; anything else unchanged. */
export function withAccent(ch) {
  return ACCENTS[ch] ?? ch;
}

/**
 * Applies one key to a field's value. `start`/`end` are the selection, or
 * null when the field has none (type=number/email): then it edits the end.
 * @returns {{ value: string, caret: number }}
 */
export function applyKey(value, start, end, key) {
  const v = String(value ?? '');
  const s = Number.isInteger(start) ? Math.max(0, Math.min(start, v.length)) : v.length;
  const e = Number.isInteger(end) ? Math.max(s, Math.min(end, v.length)) : s;
  if (key === 'backspace') {
    if (e > s) return { value: v.slice(0, s) + v.slice(e), caret: s };
    if (s === 0) return { value: v, caret: 0 };
    // Drop a whole surrogate pair, not half of it.
    const cut = s >= 2 && /[\uDC00-\uDFFF]/.test(v[s - 1]) ? 2 : 1;
    return { value: v.slice(0, s - cut) + v.slice(e), caret: s - cut };
  }
  const text = String(key);
  return { value: v.slice(0, s) + text + v.slice(e), caret: s + text.length };
}

// ---- iPad-like kinetic scrolling (2026-10-13) ----
// José: on the all-in-one touch PC the finger must feel like an iPad. The
// constants follow iOS: a fling keeps going with exponential decay, time
// constant ~325 ms (the same curve UIScrollView uses at normal rate).
export const MOMENTUM_TAU_MS = 325;
export const VELOCITY_WINDOW_MS = 100;
export const MIN_FLING_SPEED = 0.15; // px per ms; slower than this just stops

/**
 * Release velocity in px/ms from the last pointer samples [{t, x, y}], using
 * only the last VELOCITY_WINDOW_MS. A finger that stopped before lifting
 * gives 0, so it does not fling.
 */
export function releaseVelocity(samples, now, windowMs = VELOCITY_WINDOW_MS) {
  const recent = (samples ?? []).filter((s) => now - s.t <= windowMs);
  if (recent.length < 2) return { vx: 0, vy: 0 };
  const a = recent[0];
  const b = recent[recent.length - 1];
  const dt = b.t - a.t;
  if (dt <= 0 || now - b.t > 50) return { vx: 0, vy: 0 };
  return { vx: (b.x - a.x) / dt, vy: (b.y - a.y) / dt };
}

/** Total distance a fling travels (px) for a release velocity (px/ms). */
export function flingDistance(v, tau = MOMENTUM_TAU_MS) {
  return Math.abs(v) < MIN_FLING_SPEED ? 0 : v * tau;
}

/** How much of a fling's distance is left after `elapsed` ms (0..1). */
export function flingRemaining(elapsed, tau = MOMENTUM_TAU_MS) {
  return Math.exp(-Math.max(0, elapsed) / tau);
}

/**
 * Like iPad, a drag that is mostly vertical only scrolls vertically (and the
 * other way round); a clearly diagonal one moves both.
 */
export function lockAxis(dx, dy) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ay > ax * 1.5) return 'y';
  if (ax > ay * 1.5) return 'x';
  return 'both';
}

/**
 * Can a box with these metrics still scroll by (dx, dy) px of content?
 * Used to hand the drag to the page when an inner list is at its end.
 */
export function canScrollBy(box, dx, dy) {
  const maxTop = box.scrollHeight - box.clientHeight;
  const maxLeft = box.scrollWidth - box.clientWidth;
  const y = dy !== 0 && maxTop > 1 && (dy > 0 ? box.scrollTop < maxTop - 0.5 : box.scrollTop > 0.5);
  const x = dx !== 0 && maxLeft > 1 && (dx > 0 ? box.scrollLeft < maxLeft - 0.5 : box.scrollLeft > 0.5);
  return x || y;
}

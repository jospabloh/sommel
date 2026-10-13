// Touch-screen mode (2026-10-13): decisions behind drag-to-scroll and the
// on-screen keyboard. No imports: tested in Deno (base44/tests/touch_mode_test.ts).

export const TOUCH_PREFS_KEY = 'sommel.touch';
export const DEFAULT_TOUCH_PREFS = Object.freeze({ dragScroll: false, keyboard: false });

/** Stored JSON -> prefs. Anything unreadable falls back to everything off. */
export function parseTouchPrefs(raw) {
  try {
    const v = JSON.parse(raw ?? 'null');
    if (!v || typeof v !== 'object') return { ...DEFAULT_TOUCH_PREFS };
    return { dragScroll: v.dragScroll === true, keyboard: v.keyboard === true };
  } catch {
    return { ...DEFAULT_TOUCH_PREFS };
  }
}

/** A press only becomes a scroll after the finger moved this far (px), so a
 *  tap on a button is still a tap. */
export const DRAG_THRESHOLD_PX = 8;

export function passedDragThreshold(dx, dy, threshold = DRAG_THRESHOLD_PX) {
  return Math.hypot(dx, dy) >= threshold;
}

/** Native touch already scrolls; drag-to-scroll is for screens that Windows
 *  reports as a mouse (or a pen). */
export function handlesPointer(pointerType, button) {
  return (pointerType === 'mouse' || pointerType === 'pen') && button === 0;
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

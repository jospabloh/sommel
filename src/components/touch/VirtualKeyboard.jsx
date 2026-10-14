// On-screen keyboard for touch screens with no physical keyboard
// (2026-10-13). Opens when a text field gets focus and the option is on in
// Ajustes > "Esta pantalla". Keys never take the focus (pointerdown is
// prevented), so the field keeps its caret, and values are written through
// the native setter + an `input` event so React-controlled fields update.
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, Delete } from 'lucide-react';
import { applyKey, keyboardFor, withAccent } from '@/lib/touch/touchLogic';

const LETTERS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ñ'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
];
const SYMBOLS = [
  ['-', '/', ':', ';', '(', ')', '$', '&', '"', "'"],
  ['#', '%', '+', '=', '*', '_', '¿', '?', '¡', '!'],
  [',', '<', '>', '[', ']', '{', '}'],
];
const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
// After a press is released, how long the click handler gets before the keyboard may hide.
const RELEASE_GRACE_MS = 250;
const NUMPAD = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['.', '0', 'backspace']];

function describe(el) {
  return {
    tag: el.tagName,
    type: el.getAttribute('type') ?? '',
    inputMode: el.getAttribute('inputmode') ?? '',
    readOnly: el.readOnly,
    disabled: el.disabled,
  };
}

/** Long text keeps its end visible: that is where the caret is. */
const tail = (t) => (t.length > 40 ? `…${t.slice(-40)}` : t);

/** What the preview strip shows: the field's name and what it holds. */
function fieldInfo(el) {
  const label = (el.labels?.[0]?.textContent || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim();
  return { label, value: el.value ?? '', secret: el.getAttribute('type') === 'password' };
}

function selection(el) {
  try {
    return [el.selectionStart, el.selectionEnd];
  } catch {
    return [null, null]; // type=number/email have no selection API
  }
}

function writeValue(el, value, caret) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  try {
    el.setSelectionRange(caret, caret);
  } catch {
    // No caret API on this input type: edits always go at the end.
  }
}

export default function VirtualKeyboard() {
  const [target, setTarget] = useState(null);
  // The keyboard can cover the field (a dialog, the bottom of the page), so it
  // repeats what is being typed above the keys (José, 2026-10-13).
  const [shown, setShown] = useState({ label: '', value: '', secret: false });
  const [kind, setKind] = useState(null);
  const [shift, setShift] = useState(false);
  const [symbols, setSymbols] = useState(false);
  const [accent, setAccent] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    const onIn = (e) => {
      const el = e.target;
      if (!(el instanceof HTMLElement) || el.closest('[data-no-vkeyboard]')) return;
      const k = keyboardFor(describe(el));
      if (!k) return;
      setTarget(el);
      setShown(fieldInfo(el));
      setKind(k);
      setSymbols(false);
      setAccent(false);
    };
    // Losing focus must not hide the keyboard while a press is still going:
    // tapping a dialog's button blurs the field on pointerdown, and hiding the
    // keyboard right then moves the dialog back to the centre before the
    // pointer is released, so the click lands on empty space and is lost
    // (José would have to tap twice). The check waits for the release and the
    // click that follows it.
    let pressing = false;
    let deferred = false;
    let safety = 0;
    const check = () => {
      deferred = false;
      clearTimeout(safety);
      const a = document.activeElement;
      if (!(a instanceof HTMLElement) || !keyboardFor(describe(a))) setTarget(null);
    };
    const onOut = () => {
      // Wait a tick: focus moving to another field fires focusin right after.
      setTimeout(() => {
        if (!pressing) {
          check();
          return;
        }
        deferred = true;
        clearTimeout(safety);
        safety = setTimeout(check, 1500); // a release we never hear about
      }, 0);
    };
    const onPress = () => { pressing = true; };
    const onRelease = () => {
      pressing = false;
      if (deferred) {
        clearTimeout(safety);
        safety = setTimeout(check, RELEASE_GRACE_MS);
      }
    };
    document.addEventListener('focusin', onIn);
    document.addEventListener('focusout', onOut);
    document.addEventListener('pointerdown', onPress, true);
    document.addEventListener('pointerup', onRelease, true);
    document.addEventListener('pointercancel', onRelease, true);
    return () => {
      clearTimeout(safety);
      document.removeEventListener('focusin', onIn);
      document.removeEventListener('focusout', onOut);
      document.removeEventListener('pointerdown', onPress, true);
      document.removeEventListener('pointerup', onRelease, true);
      document.removeEventListener('pointercancel', onRelease, true);
    };
  }, []);

  // Room for the keyboard: the page gets bottom padding, dialogs move up
  // (index.css, html.vkb-open), and the field scrolls into view.
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (!target || !boxRef.current) {
      root.classList.remove('vkb-open');
      return undefined;
    }
    root.style.setProperty('--vkb-h', `${boxRef.current.offsetHeight}px`);
    root.classList.add('vkb-open');
    const t = setTimeout(() => target.scrollIntoView?.({ block: 'center', behavior: 'smooth' }), 50);
    return () => clearTimeout(t);
  }, [target, kind]);

  useEffect(() => () => document.documentElement.classList.remove('vkb-open'), []);

  // Also follow what the field itself changes (a physical key, a formatter).
  useEffect(() => {
    if (!target) return undefined;
    const sync = () => setShown(fieldInfo(target));
    target.addEventListener('input', sync);
    return () => target.removeEventListener('input', sync);
  }, [target]);

  const press = useCallback(
    (key) => {
      const el = target;
      if (!el || !el.isConnected) return;
      if (key === 'enter') {
        if (el instanceof HTMLTextAreaElement) key = '\n';
        else {
          if (el.form?.requestSubmit) el.form.requestSubmit();
          else el.blur();
          return;
        }
      }
      let text = key;
      if (key !== 'backspace' && key.length === 1) {
        if (shift) text = text.toUpperCase();
        if (accent) text = withAccent(text);
      }
      const [s, e] = selection(el);
      const next = applyKey(el.value, s, e, text);
      writeValue(el, next.value, next.caret);
      setShown(fieldInfo(el));
      if (key !== 'backspace') {
        setShift(false);
        setAccent(false);
      }
    },
    [target, shift, accent],
  );

  if (!target) return null;

  // Every key: no focus steal, no dialog "outside click", works under a
  // modal's `pointer-events: none` on <body>.
  const keyProps = (onPress) => ({
    type: 'button',
    onPointerDown: (e) => {
      e.preventDefault();
      e.stopPropagation();
      onPress();
    },
    onClick: (e) => e.preventDefault(),
  });
  const keyCls = 'h-12 sm:h-14 rounded-md bg-card border border-border text-lg font-medium text-foreground active:bg-primary/20 select-none';

  const hide = () => {
    target.blur();
    setTarget(null);
  };

  const charKey = (ch) => (
    <button key={ch} {...keyProps(() => press(ch))} className={`${keyCls} flex-1 min-w-0`}>
      {shift ? ch.toUpperCase() : ch}
    </button>
  );

  return (
    <div
      ref={boxRef}
      data-vkeyboard
      data-no-drag-scroll
      style={{ pointerEvents: 'auto' }}
      onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
      className="fixed inset-x-0 bottom-0 z-[100] border-t border-border bg-muted/95 backdrop-blur p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      aria-label="Teclado en pantalla"
    >
      <div className="mx-auto max-w-4xl space-y-1.5">
        <div className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2 min-h-12" aria-live="polite">
          {shown.label ? <span className="shrink-0 text-sm text-muted-foreground max-w-[40%] truncate">{shown.label}</span> : null}
          <span className="min-w-0 flex-1 truncate text-lg text-foreground" dir="ltr">
            {shown.value ? tail(shown.secret ? '•'.repeat(shown.value.length) : shown.value) : <span className="text-muted-foreground">Escribe aquí</span>}
            <span className="ml-0.5 inline-block w-0.5 h-5 align-middle bg-primary animate-pulse" aria-hidden="true" />
          </span>
        </div>
        {kind === 'numeric' ? (
          <div className="mx-auto max-w-sm space-y-1.5">
            {NUMPAD.map((row) => (
              <div key={row.join('')} className="flex gap-1.5">
                {row.map((k) =>
                  k === 'backspace' ? (
                    <button key={k} {...keyProps(() => press('backspace'))} className={`${keyCls} flex-1 flex items-center justify-center`} aria-label="Borrar">
                      <Delete className="w-5 h-5" />
                    </button>
                  ) : (
                    <button key={k} {...keyProps(() => press(k))} className={`${keyCls} flex-1`}>{k}</button>
                  ),
                )}
              </div>
            ))}
            <div className="flex gap-1.5">
              <button {...keyProps(hide)} className={`${keyCls} flex-1 flex items-center justify-center`} aria-label="Ocultar teclado">
                <ChevronDown className="w-5 h-5" />
              </button>
              <button {...keyProps(() => press('enter'))} className={`${keyCls} flex-[2] bg-primary text-primary-foreground border-primary`}>Listo</button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex gap-1">{DIGITS.map(charKey)}</div>
            {(symbols ? SYMBOLS : LETTERS).map((row, i) => (
              <div key={row.join('')} className="flex gap-1">
                {i === 2 && !symbols ? (
                  <button
                    {...keyProps(() => setShift((v) => !v))}
                    className={`${keyCls} flex-[1.5] ${shift ? 'bg-primary text-primary-foreground border-primary' : ''}`}
                    aria-label="Mayúscula"
                  >
                    ⇧
                  </button>
                ) : null}
                {row.map(charKey)}
                {i === 2 ? (
                  <>
                    {!symbols ? (
                      <button
                        {...keyProps(() => setAccent((v) => !v))}
                        className={`${keyCls} flex-1 ${accent ? 'bg-primary text-primary-foreground border-primary' : ''}`}
                        aria-label="Acento: la siguiente vocal sale con acento"
                      >
                        ´
                      </button>
                    ) : null}
                    <button {...keyProps(() => press('backspace'))} className={`${keyCls} flex-[1.5] flex items-center justify-center`} aria-label="Borrar">
                      <Delete className="w-5 h-5" />
                    </button>
                  </>
                ) : null}
              </div>
            ))}
            <div className="flex gap-1">
              <button {...keyProps(() => setSymbols((v) => !v))} className={`${keyCls} flex-[1.5] text-base`}>
                {symbols ? 'ABC' : '#+='}
              </button>
              <button {...keyProps(() => press('@'))} className={`${keyCls} flex-1`}>@</button>
              <button {...keyProps(() => press(' '))} className={`${keyCls} flex-[5]`} aria-label="Espacio">espacio</button>
              <button {...keyProps(() => press('.'))} className={`${keyCls} flex-1`}>.</button>
              <button {...keyProps(hide)} className={`${keyCls} flex-1 flex items-center justify-center`} aria-label="Ocultar teclado">
                <ChevronDown className="w-5 h-5" />
              </button>
              <button {...keyProps(() => press('enter'))} className={`${keyCls} flex-[2] bg-primary text-primary-foreground border-primary text-base`}>
                {target instanceof HTMLTextAreaElement ? '↵' : 'Listo'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

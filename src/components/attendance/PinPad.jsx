// Teclado numérico grande para el PIN (tablet compartida). Controlado: el
// padre guarda el valor. Acepta también el teclado físico.
//
// Largo fijo (2026-10-13, José: "que entre de una vez"): todos los PINs del bar
// miden `length` (4 salvo que el admin elija 5 o 6 en Ajustes), así que al
// teclear el último dígito se llama `onSubmit(pin)` solo, sin botón "Listo".
// Con `error`, los puntos tiemblan y el mensaje sale debajo; el padre borra el
// PIN para el siguiente intento.
import React, { useEffect, useRef, useState } from 'react';
import { Delete } from 'lucide-react';
import { cn } from '@/lib/utils';

export const DEFAULT_PIN_LENGTH = 4;

/** The bar's PIN length from a server response, 4 when missing or odd. */
export function pinLengthFrom(v) {
  return v === 4 || v === 5 || v === 6 ? v : DEFAULT_PIN_LENGTH;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

const keyClass =
  'h-16 sm:h-20 rounded-2xl border border-border bg-card text-2xl font-semibold tabular-nums ' +
  'active:bg-accent/20 hover:bg-secondary transition-colors select-none touch-manipulation ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';

export default function PinPad({ value, onChange, onSubmit, length = DEFAULT_PIN_LENGTH, error = null, disabled = false, listenKeyboard = true }) {
  const size = pinLengthFrom(length);
  const [shaking, setShaking] = useState(false);
  const lastError = useRef(null);

  useEffect(() => {
    if (error && error !== lastError.current) {
      setShaking(true);
      navigator.vibrate?.(120);
      const t = setTimeout(() => setShaking(false), 450);
      lastError.current = error;
      return () => clearTimeout(t);
    }
    if (!error) lastError.current = null;
    return undefined;
  }, [error]);

  const add = (d) => {
    if (disabled || value.length >= size) return;
    const next = value + d;
    onChange(next);
    if (next.length === size) onSubmit?.(next);
  };
  const back = () => {
    if (disabled) return;
    onChange(value.slice(0, -1));
  };

  useEffect(() => {
    if (!listenKeyboard) return undefined;
    const onKey = (e) => {
      if (e.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      if (/^\d$/.test(e.key)) add(e.key);
      else if (e.key === 'Backspace') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // On phones the pad spans the whole width, so its right column sat under the
  // theme switcher and a tap toggled the theme instead. Below `sm` the pad
  // keeps the switcher's column free. Inside Layout's page wrapper that gutter
  // already exists, and Layout zeroes this one through the `pin-pad` class;
  // outside it (terminal lock, approval dialog) this is the only gutter.
  return (
    <div className="pin-pad w-full max-w-xs mx-auto space-y-5 max-sm:pr-12">
      <div className="space-y-2">
        <div
          className={cn('flex justify-center gap-3 h-6', shaking && 'pin-shake')}
          aria-label={`${value.length} de ${size} dígitos escritos`}
          role="img"
        >
          {Array.from({ length: size }, (_, i) => (
            <span
              key={i}
              className={cn(
                'w-4 h-4 rounded-full border-2 transition-colors',
                error && value.length === 0
                  ? 'border-destructive'
                  : i < value.length
                    ? 'bg-primary border-primary'
                    : 'border-muted-foreground/40'
              )}
            />
          ))}
        </div>
        <p className="text-center text-sm font-medium text-destructive min-h-[1.25rem]" role="alert" aria-live="assertive">
          {error}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {KEYS.map((k) => (
          <button key={k} type="button" className={keyClass} onClick={() => add(k)} disabled={disabled}>
            {k}
          </button>
        ))}
        <span aria-hidden="true" />
        <button type="button" className={keyClass} onClick={() => add('0')} disabled={disabled}>
          0
        </button>
        <button type="button" className={cn(keyClass, 'text-muted-foreground')} onClick={back} disabled={disabled || value.length === 0} aria-label="Borrar">
          <Delete className="w-6 h-6 mx-auto" />
        </button>
      </div>
    </div>
  );
}

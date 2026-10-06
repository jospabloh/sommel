// Teclado numérico grande para el PIN (tablet compartida). Controlado: el
// padre guarda el valor. Acepta también el teclado físico.
import React, { useEffect } from 'react';
import { Delete } from 'lucide-react';
import { cn } from '@/lib/utils';

export const PIN_MAX = 6;
export const PIN_MIN = 4;

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

const keyClass =
  'h-16 sm:h-20 rounded-2xl border border-border bg-card text-2xl font-semibold tabular-nums ' +
  'active:bg-accent/20 hover:bg-secondary transition-colors select-none touch-manipulation ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';

export default function PinPad({ value, onChange, onSubmit, disabled = false, listenKeyboard = true }) {
  const add = (d) => {
    if (disabled || value.length >= PIN_MAX) return;
    onChange(value + d);
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
      else if (e.key === 'Enter' && value.length >= PIN_MIN) onSubmit?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // On phones the pad spans the whole content width, so its right column
  // ("3", "6", "9", "Listo") sat under the theme switcher's corner and a tap on
  // "Listo" toggled the theme instead. The pad is the only thing on that edge
  // (moving the switcher just lands it on another key), so below `sm` the pad
  // keeps the switcher's column (40px + its 1rem offset) free.
  return (
    <div className="w-full max-w-xs mx-auto space-y-5 max-sm:pr-12">
      <div className="flex justify-center gap-3 h-6" aria-label={`${value.length} dígitos escritos`} role="img">
        {Array.from({ length: PIN_MAX }, (_, i) => (
          <span
            key={i}
            className={cn(
              'w-4 h-4 rounded-full border-2 transition-colors',
              i < value.length ? 'bg-primary border-primary' : 'border-muted-foreground/40',
              i >= PIN_MIN && i >= value.length && 'opacity-40'
            )}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {KEYS.map((k) => (
          <button key={k} type="button" className={keyClass} onClick={() => add(k)} disabled={disabled}>
            {k}
          </button>
        ))}
        <button type="button" className={cn(keyClass, 'text-muted-foreground')} onClick={back} disabled={disabled || value.length === 0} aria-label="Borrar">
          <Delete className="w-6 h-6 mx-auto" />
        </button>
        <button type="button" className={keyClass} onClick={() => add('0')} disabled={disabled}>
          0
        </button>
        <button
          type="button"
          className={cn(keyClass, 'bg-primary text-primary-foreground border-primary hover:bg-primary/90 text-lg')}
          onClick={() => onSubmit?.()}
          disabled={disabled || value.length < PIN_MIN}
        >
          Listo
        </button>
      </div>
    </div>
  );
}

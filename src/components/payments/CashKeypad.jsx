// Teclado de efectivo (contrato entrega 2, seccion 6, Cobro). Edita una
// cadena en pesos ("600.50"); la conversion a centavos la hace quien lo usa.
// Solo captura: el cambio real lo calcula y confirma el servidor.
import React from 'react';
import { Delete } from 'lucide-react';
import { cn } from '@/lib/utils';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'];
const QUICK = [100, 200, 500, 1000];

/** Applies one key press to the pesos string, keeping it a valid amount. */
export function pressKey(value, key) {
  if (key === 'del') return value.slice(0, -1);
  if (key === '.') {
    if (value.includes('.')) return value;
    return value === '' ? '0.' : `${value}.`;
  }
  if (value.length >= 9) return value;
  const dot = value.indexOf('.');
  if (dot !== -1 && value.length - dot > 2) return value; // max 2 decimals
  if (value === '0') return key; // no leading zero
  return value + key;
}

export default function CashKeypad({ value, onChange, onExact, disabled }) {
  return (
    <div className="space-y-2">
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          disabled={disabled}
          onClick={onExact}
          className="shrink-0 h-9 px-3 rounded-full border border-primary/50 bg-primary/10 text-primary text-sm font-medium active:scale-95 disabled:opacity-50"
        >
          Exacto
        </button>
        {QUICK.map((pesos) => (
          <button
            key={pesos}
            type="button"
            disabled={disabled}
            onClick={() => onChange(String(pesos))}
            className="shrink-0 h-9 px-3 rounded-full border border-border text-sm active:scale-95 disabled:opacity-50"
          >
            ${pesos.toLocaleString('es-MX')}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            disabled={disabled}
            onClick={() => onChange(pressKey(value, k))}
            aria-label={k === 'del' ? 'Borrar' : k === '.' ? 'Punto decimal' : k}
            className={cn(
              'h-12 rounded-lg border border-border text-lg font-medium flex items-center justify-center active:scale-95 disabled:opacity-50',
              k === 'del' ? 'bg-muted text-muted-foreground' : 'bg-card'
            )}
          >
            {k === 'del' ? <Delete className="w-5 h-5" /> : k}
          </button>
        ))}
      </div>
    </div>
  );
}

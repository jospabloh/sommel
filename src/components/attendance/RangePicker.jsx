// Selector de rango: hoy, semana o rango libre (fechas locales del bar).
import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { addDays, localDate, weekStart } from './helpers';

const PRESETS = [
  { key: 'hoy', label: 'Hoy' },
  { key: 'semana', label: 'Semana' },
  { key: 'rango', label: 'Rango' },
];

/** { mode, from, to } inicial para un modo. */
export function rangeFor(mode, current) {
  const today = localDate();
  if (mode === 'hoy') return { mode, from: today, to: today };
  if (mode === 'semana') {
    const start = weekStart(today);
    return { mode, from: start, to: addDays(start, 6) };
  }
  return { mode, from: current?.from || addDays(today, -6), to: current?.to || today };
}

export default function RangePicker({ value, onChange }) {
  return (
    <div className="space-y-3">
      <div className="flex gap-2" role="group" aria-label="Periodo">
        {PRESETS.map((p) => (
          <Button
            key={p.key}
            type="button"
            variant={value.mode === p.key ? 'default' : 'outline'}
            className="h-11 flex-1 sm:flex-none sm:px-6"
            aria-pressed={value.mode === p.key}
            onClick={() => onChange(rangeFor(p.key, value))}
          >
            {p.label}
          </Button>
        ))}
      </div>
      {value.mode === 'rango' ? (
        <div className="grid grid-cols-2 gap-3 max-w-md">
          <div className="space-y-1.5">
            <Label htmlFor="range-from">Desde</Label>
            <Input id="range-from" type="date" className="h-11" value={value.from} max={value.to}
              onChange={(e) => e.target.value && onChange({ ...value, from: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="range-to">Hasta</Label>
            <Input id="range-to" type="date" className="h-11" value={value.to} min={value.from}
              onChange={(e) => e.target.value && onChange({ ...value, to: e.target.value })} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

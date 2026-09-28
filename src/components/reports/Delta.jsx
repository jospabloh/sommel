// Comparison chip: arrow plus percent versus the previous period.
// `goodWhen` says which direction is good news ('up' for sales, 'down' for
// discounts), so the color never claims a rise in discounts is a win.
import React from 'react';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { pctChange } from './periods';

export default function Delta({ current, previous, goodWhen = 'up' }) {
  const pct = pctChange(current, previous);

  if (pct === null) {
    const text = current ? 'Sin periodo previo' : 'Sin cambio';
    return <span className="text-xs text-muted-foreground">{text}</span>;
  }

  const rounded = Math.round(pct * 10) / 10;
  if (rounded === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="w-3.5 h-3.5" aria-hidden="true" /> 0% vs anterior
      </span>
    );
  }

  const up = rounded > 0;
  const good = (goodWhen === 'up') === up;
  const tone = good ? 'text-[hsl(var(--chart-3))]' : 'text-destructive';
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${tone}`}>
      <Icon className="w-3.5 h-3.5" aria-hidden="true" />
      {Math.abs(rounded).toLocaleString('es-MX')}% vs anterior
    </span>
  );
}

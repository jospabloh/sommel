// Horas totales por persona en el periodo elegido.
import React from 'react';
import { Badge } from '@/components/ui/badge';
import { fmtDuration } from './helpers';

export default function TotalsList({ totals }) {
  if (totals.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="font-display text-lg font-semibold">Horas por persona</h2>
      <ul className="rounded-xl border border-border bg-card divide-y divide-border">
        {totals.map((t) => (
          <li key={t.user_id} className="flex items-center gap-3 px-4 py-3 min-h-[56px]">
            <span className="flex-1 min-w-0 font-medium truncate">{t.name}</span>
            {t.open ? <Badge variant="secondary">Dentro</Badge> : null}
            <span className="tabular-nums font-semibold">{fmtDuration(t.minutes)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

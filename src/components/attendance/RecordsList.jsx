// Lista de marcas del periodo: entrada, salida, horas, avisos y corrección.
import React from 'react';
import { Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { fmtDay, fmtDuration, fmtTime } from './helpers';

export default function RecordsList({ records, showName, canCorrect, onCorrect }) {
  if (records.length === 0) {
    return <p className="text-sm text-muted-foreground py-6 text-center">No hay marcas en este periodo.</p>;
  }
  return (
    <ul className="rounded-xl border border-border bg-card divide-y divide-border">
      {records.map((r) => (
        <li key={r.id} className="px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2 min-h-[64px]">
          <div className="flex-1 min-w-[10rem]">
            <p className="font-medium capitalize">
              {showName ? `${r.user_name || 'Sin nombre'} · ` : ''}
              {fmtDay(r.clock_in)}
            </p>
            <p className="text-sm text-muted-foreground tabular-nums">
              {fmtTime(r.clock_in)} a {r.clock_out ? fmtTime(r.clock_out) : 'sin salida'}
            </p>
            {r.edit_note ? (
              <p className="text-xs text-muted-foreground mt-0.5">Corregida por {r.edited_by}: {r.edit_note}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {r.forgotten ? <Badge variant="destructive">Salida olvidada</Badge> : null}
            {!r.clock_out && !r.forgotten ? <Badge variant="secondary">Dentro</Badge> : null}
            {r.edited_at ? <Badge variant="outline">Corregida</Badge> : null}
            <span className="tabular-nums font-semibold w-24 text-right">
              {r.forgotten ? 'sin calcular' : fmtDuration(r.minutes)}
            </span>
            {canCorrect ? (
              <Button type="button" variant="outline" size="icon" className="h-11 w-11" onClick={() => onCorrect(r)} aria-label="Corregir marca">
                <Pencil className="w-4 h-4" />
              </Button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

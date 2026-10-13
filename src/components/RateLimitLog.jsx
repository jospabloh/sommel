// Acerca: the "ocupado" (429) notices this device got, newest first. Only
// shown when there is something to show.
import React, { useState } from 'react';
import { Gauge } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { clearRateLog, readRateLog } from '@/lib/rateLog';

function when(iso) {
  try {
    return new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'medium' });
  } catch {
    return iso;
  }
}

export default function RateLimitLog() {
  const [rows, setRows] = useState(readRateLog);
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby="ocupado-title" className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-2">
        <Gauge className="w-5 h-5 text-primary" aria-hidden="true" />
        <h2 id="ocupado-title" className="font-display text-xl font-semibold">Avisos de "muchas solicitudes" en este equipo</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-3">
        Cada vez que el servidor respondió que estaba ocupado. Si pasa seguido, mándanos una foto de esta lista.
      </p>
      <ul className="divide-y divide-border text-sm max-h-72 overflow-y-auto">
        {rows.map((r) => (
          <li key={`${r.at}-${r.endpoint}-${r.action}-${r.attempt}`} className="py-1.5 flex flex-wrap gap-x-3">
            <span className="tabular-nums">{when(r.at)}</span>
            <span className="text-muted-foreground">{r.path || 'sin pantalla'}</span>
            <span className="text-muted-foreground">{r.endpoint}.{r.action}{r.attempt ? ` (reintento ${r.attempt})` : ''}</span>
          </li>
        ))}
      </ul>
      <Button size="sm" variant="outline" className="mt-3" onClick={() => { clearRateLog(); setRows([]); }}>
        Borrar la lista
      </Button>
    </section>
  );
}

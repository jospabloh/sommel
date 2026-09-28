// Historial de cortes anteriores (Turno:ver_corte).
import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { callFn } from '@/lib/api';
import { formatMXN } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import CorteSummary, { differenceText } from './CorteSummary';
import CorteActions from './CorteActions';
import { fmtDay, fmtTime } from './helpers';

function HistoryRow({ initial }) {
  const [shift, setShift] = useState(initial);
  const [expanded, setExpanded] = useState(false);
  const s = shift.summary;
  const diff = shift.difference ?? s?.difference ?? 0;
  return (
    <li className="rounded-lg border border-border bg-card">
      <button
        type="button"
        className="w-full flex items-center gap-3 px-3 py-3 text-left min-h-[56px]"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <div className="flex-1 min-w-0">
          <p className="font-medium capitalize">{fmtDay(shift.closed_at)}</p>
          <p className="text-xs text-muted-foreground truncate">
            {fmtTime(shift.opened_at)} a {fmtTime(shift.closed_at)} · {shift.closed_by}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="tabular-nums text-sm font-semibold">{formatMXN(s?.sales_total ?? 0)}</p>
          <p className={cn('text-xs', diff !== 0 ? 'text-destructive' : 'text-muted-foreground')}>
            {differenceText(diff)}
            {diff !== 0 ? ` ${formatMXN(diff)}` : ''}
          </p>
        </div>
        <ChevronDown className={cn('w-4 h-4 shrink-0 transition-transform', expanded && 'rotate-180')} />
      </button>
      {expanded ? (
        <div className="border-t border-border px-3 py-4 space-y-5">
          <CorteActions shift={shift} canCorte onEmailChanged={(patch) => setShift((x) => ({ ...x, ...patch }))} />
          <CorteSummary summary={s} comment={shift.close_comment} />
        </div>
      ) : null}
    </li>
  );
}

export default function ShiftHistory({ refreshKey }) {
  const [shifts, setShifts] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await callFn('shifts', 'list', { limit: 30 });
      setShifts(res.shifts || []);
    } catch (err) {
      setError(err.message || 'No se pudo cargar el historial');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  return (
    <section className="space-y-3">
      <h2 className="font-display text-lg font-semibold">Cortes anteriores</h2>
      {error ? (
        <div className="rounded-xl border border-border bg-card p-4 text-center space-y-3">
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" onClick={load}>Reintentar</Button>
        </div>
      ) : shifts === null ? (
        <div className="flex justify-center py-6">
          <div className="w-6 h-6 border-4 border-border border-t-primary rounded-full animate-spin" />
        </div>
      ) : shifts.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aún no hay cortes. El primero aparece al cerrar un turno.</p>
      ) : (
        <ul className="space-y-2">
          {shifts.map((sh) => (
            <HistoryRow key={sh.id} initial={sh} />
          ))}
        </ul>
      )}
    </section>
  );
}

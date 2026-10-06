// One row of the print queue. Actions depend on where the job is:
// pendiente -> Imprimir (in queue order), reclamado by this device ->
// confirm or mark failed, fallido -> Reintentar, impreso -> Reimprimir.
import React, { useState } from 'react';
import { Printer, RotateCw, Copy, Check, X, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import TicketLines from './TicketLines';
import { jobTitle, formatTime, shortDevice, KIND_LABELS } from './printingHelpers';

const STATUS_LABEL = {
  pendiente: 'En cola',
  reclamado: 'Imprimiendo',
  fallido: 'Falló',
  impreso: 'Impreso',
};

const STATUS_CLASS = {
  pendiente: 'bg-secondary text-secondary-foreground',
  reclamado: 'bg-primary/15 text-primary',
  fallido: 'bg-destructive/15 text-destructive',
  impreso: 'bg-muted text-muted-foreground',
};

export default function JobRow({ job, deviceId, isNext, otherDevice = false, busy, onPrint, onRetry, onReprint, onConfirm, onFail }) {
  const [open, setOpen] = useState(false);
  const mine = job.status === 'reclamado' && job.claimed_by === deviceId;
  const when = job.status === 'impreso' ? job.printed_at : job.created_date;

  return (
    <li className="bg-card border border-border rounded-xl p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={`Ver contenido de ${jobTitle(job)}`}
          className="flex items-center gap-2 min-w-0 w-full sm:w-auto sm:flex-1 text-left"
        >
          <ChevronDown className={cn('w-4 h-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
          <span className="min-w-0">
            <span className="block font-medium truncate">{jobTitle(job)}</span>
            <span className="block text-xs text-muted-foreground">
              {KIND_LABELS[job.kind] || job.kind}
              {when ? ` · ${formatTime(when)}` : ''}
              {job.reprint_of ? ' · copia' : ''}
              {job.status === 'reclamado' && job.claimed_by ? ` · equipo ${shortDevice(job.claimed_by)}` : ''}
            </span>
          </span>
        </button>

        <span className={cn('rounded-md px-2 py-0.5 text-xs font-semibold', STATUS_CLASS[job.status])}>
          {STATUS_LABEL[job.status] || job.status}
        </span>

        <div className="flex flex-wrap items-center gap-2">
          {job.status === 'pendiente' && (
            <Button
              size="sm"
              onClick={() => onPrint(job)}
              disabled={busy || !isNext}
              title={isNext ? undefined : otherDevice ? 'Este equipo no imprime este tipo. Actívalo en «Qué imprime este equipo»' : 'Los trabajos se imprimen en orden'}
            >
              <Printer /> Imprimir
            </Button>
          )}
          {mine && (
            <>
              <Button size="sm" variant="outline" onClick={() => onConfirm(job)} disabled={busy}>
                <Check /> Ya se imprimió
              </Button>
              <Button size="sm" variant="outline" onClick={() => onFail(job)} disabled={busy}>
                <X /> No salió
              </Button>
            </>
          )}
          {job.status === 'fallido' && (
            <Button size="sm" variant="outline" onClick={() => onRetry(job)} disabled={busy}>
              <RotateCw /> Reintentar
            </Button>
          )}
          {job.status === 'impreso' && (
            <Button size="sm" variant="outline" onClick={() => onReprint(job)} disabled={busy}>
              <Copy /> Reimprimir
            </Button>
          )}
        </div>
      </div>

      {job.status === 'fallido' && job.error && (
        <p className="mt-2 text-sm text-destructive">{job.error}</p>
      )}

      {open && (
        <div className="mt-3 rounded-lg border border-border bg-background p-3 overflow-x-auto">
          <TicketLines lines={job.lines} />
        </div>
      )}
    </li>
  );
}

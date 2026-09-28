// Estación de impresión (contrato Entrega 2, sección 6). Pensada para dejarse
// abierta en la laptop de caja: reclama los trabajos de la cola, los pinta en
// un área de 58 mm y confirma con el servidor. Nunca escribe entidades
// directo; todo pasa por la función `printing`.
import React from 'react';
import { Printer, RefreshCw } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import JobRow from '@/components/printing/JobRow';
import KioskInstructions from '@/components/printing/KioskInstructions';
import PrintArea from '@/components/printing/PrintArea';
import usePrintStation from '@/components/printing/usePrintStation';
import { formatTime, shortDevice } from '@/components/printing/printingHelpers';

function Section({ title, hint, count, children }) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline gap-2">
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        {count > 0 && <span className="text-sm text-muted-foreground">{count}</span>}
      </div>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      {children}
    </section>
  );
}

export default function Impresion() {
  const { user } = useAuth();
  const station = usePrintStation(user?.tenant_id ?? null);
  const { deviceId, jobs, loading, loadError, lastSync, auto, setAuto, busy, paperJob } = station;

  const waiting = jobs.filter((j) => j.status === 'pendiente' || j.status === 'reclamado');
  const failed = jobs.filter((j) => j.status === 'fallido');
  const done = jobs.filter((j) => j.status === 'impreso');
  const nextId = jobs.find((j) => j.status === 'pendiente')?.id;
  const pendingCount = jobs.filter((j) => j.status === 'pendiente').length;

  const rowProps = {
    deviceId,
    busy,
    onPrint: station.printNext,
    onRetry: station.retry,
    onReprint: station.reprint,
    onConfirm: station.confirmPrinted,
    onFail: station.markFailed,
  };

  return (
    <div className="p-4 sm:p-6 lg:p-10 max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
          <Printer className="w-6 h-6 text-primary" />
        </div>
        <div className="min-w-0">
          <h1 className="font-display text-2xl sm:text-3xl font-semibold">Estación de impresión</h1>
          <p className="text-muted-foreground mt-0.5">Tickets y cortes desde la laptop de caja.</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <label htmlFor="auto-print" className="font-medium block">Imprimir automáticamente</label>
            <p className="text-sm text-muted-foreground">
              {auto
                ? 'Cada trabajo nuevo se imprime solo en este equipo.'
                : 'Apagado. Imprime cada trabajo con su botón.'}
            </p>
          </div>
          <Switch id="auto-print" checked={auto} onCheckedChange={setAuto} />
        </div>
        {!auto && pendingCount > 0 && (
          <p className="text-sm text-muted-foreground">
            Si la enciendes ahora, los {pendingCount} trabajos en cola se imprimirán de inmediato.
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            Equipo {shortDevice(deviceId)}
            {lastSync ? ` · actualizado ${formatTime(lastSync.toISOString())}` : ''}
          </span>
          <Button size="sm" variant="ghost" onClick={station.reload}>
            <RefreshCw /> Actualizar
          </Button>
        </div>
        {loadError && <p className="text-sm text-destructive">No se pudo actualizar la cola: {loadError}</p>}
      </div>

      <KioskInstructions />

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      ) : (
        <>
          <Section title="Pendientes" count={waiting.length}>
            {waiting.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay nada por imprimir.</p>
            ) : (
              <ul className="space-y-2">
                {waiting.map((job) => (
                  <JobRow key={job.id} job={job} isNext={job.id === nextId} {...rowProps} />
                ))}
              </ul>
            )}
          </Section>

          {failed.length > 0 && (
            <Section title="Fallidos" count={failed.length} hint="No se imprimieron. Reintenta cuando la impresora esté lista.">
              <ul className="space-y-2">
                {failed.map((job) => (
                  <JobRow key={job.id} job={job} {...rowProps} />
                ))}
              </ul>
            </Section>
          )}

          <Section title="Últimos impresos" count={done.length} hint="Reimprimir crea una copia nueva en la cola.">
            {done.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todavía no se imprime nada.</p>
            ) : (
              <ul className="space-y-2">
                {done.map((job) => (
                  <JobRow key={job.id} job={job} {...rowProps} />
                ))}
              </ul>
            )}
          </Section>
        </>
      )}

      <PrintArea job={paperJob} />
    </div>
  );
}

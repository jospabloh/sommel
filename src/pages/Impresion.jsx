// Estación de impresión (contrato Entrega 2, sección 6). Pensada para dejarse
// abierta en la laptop de caja: reclama los trabajos de la cola, los imprime
// y confirma con el servidor. Con una impresora conectada por USB los manda
// directo (sin driver ni cuadro de impresión); si no, usa el cuadro del
// navegador. Nunca escribe entidades directo; todo pasa por `printing`.
import React, { useEffect } from 'react';
import { Printer, RefreshCw, Usb, Unplug, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import JobRow from '@/components/printing/JobRow';
import KioskInstructions from '@/components/printing/KioskInstructions';
import usePrintStationContext from '@/components/printing/usePrintStationContext';
import { CHOOSABLE_KINDS, KIND_LABELS, formatTime, jobMatchesKinds, shortDevice } from '@/components/printing/printingHelpers';

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

function PrinterCard({ station }) {
  const { usbSupported, printer, printerName, connectPrinter, disconnectPrinter, testPrint, openDrawer, busy } = station;
  return (
    <div className="bg-card border border-border rounded-xl p-4 sm:p-5 space-y-3">
      <div className="flex items-start gap-3">
        <Usb className={`w-5 h-5 mt-0.5 shrink-0 ${printer ? 'text-primary' : 'text-muted-foreground'}`} />
        <div className="min-w-0">
          <p className="font-medium">{printer ? `Impresora conectada: ${printerName}` : 'Impresora por USB'}</p>
          <p className="text-sm text-muted-foreground">
            {!usbSupported
              ? 'Este navegador no conecta impresoras USB. Abre Sommel en Google Chrome o Microsoft Edge; mientras tanto se imprime con el cuadro de impresión.'
              : printer
                ? 'Los tickets salen directo en esta impresora, sin cuadro de impresión. Si se cobró en efectivo, se abre el cajón.'
                : 'Conecta la impresora de tickets por USB y elígela una vez. No necesitas instalar nada; este equipo la recuerda.'}
          </p>
        </div>
      </div>
      {usbSupported && (
        <div className="flex flex-wrap gap-2">
          {printer ? (
            <>
              <Button size="sm" variant="outline" onClick={testPrint} disabled={busy}>
                <Printer /> Imprimir prueba
              </Button>
              <Button size="sm" variant="outline" onClick={openDrawer} disabled={busy}>
                <Wallet /> Abrir cajón
              </Button>
              <Button size="sm" variant="ghost" onClick={disconnectPrinter} disabled={busy}>
                <Unplug /> Desconectar
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={connectPrinter}>
              <Usb /> Conectar impresora
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export default function Impresion() {
  const station = usePrintStationContext();
  const { deviceId, jobs, loading, loadError, lastSync, auto, setAuto, kinds, setKinds, busy, setPageOpen } = station;

  // While this page is open the station also works without a USB printer
  // (print dialog) and keeps the queue live.
  useEffect(() => {
    setPageOpen(true);
    return () => setPageOpen(false);
  }, [setPageOpen]);

  const waiting = jobs.filter((j) => j.status === 'pendiente' || j.status === 'reclamado');
  const failed = jobs.filter((j) => j.status === 'fallido');
  const done = jobs.filter((j) => j.status === 'impreso');
  // Only the kinds this device prints (claimNext is filtered the same way).
  const mine = jobs.filter((j) => j.status === 'pendiente' && jobMatchesKinds(j, kinds));
  const nextId = mine[0]?.id;
  const pendingCount = mine.length;
  const toggleKind = (kind) => {
    const current = kinds ?? CHOOSABLE_KINDS;
    const next = current.includes(kind) ? current.filter((k) => k !== kind) : [...current, kind];
    if (next.length === 0) return; // at least one; "todo" is all four
    setKinds(next);
  };

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
                ? station.printer
                  ? 'Cada ticket nuevo se imprime solo en este equipo, aunque estés en otra pantalla.'
                  : 'Cada trabajo nuevo se imprime solo mientras esta pantalla esté abierta.'
                : 'Apagado. Imprime cada trabajo con su botón.'}
            </p>
          </div>
          <Switch id="auto-print" checked={auto} onCheckedChange={setAuto} />
        </div>
        <div className="space-y-2 pt-1">
          <p className="font-medium" id="print-kinds">Qué imprime este equipo</p>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby="print-kinds">
            {CHOOSABLE_KINDS.map((kind) => {
              const on = !kinds || kinds.includes(kind);
              return (
                <Button
                  key={kind}
                  type="button"
                  className="h-11 px-4"
                  variant={on ? 'default' : 'outline'}
                  aria-pressed={on}
                  onClick={() => toggleKind(kind)}
                >
                  {KIND_LABELS[kind]}
                </Button>
              );
            })}
          </div>
          <p className="text-sm text-muted-foreground">
            {kinds
              ? 'Lo que no elijas se queda en la cola para la impresora de otro equipo. Si ningún equipo lo imprime, actívalo aquí.'
              : 'Todo. Con dos impresoras, apaga aquí lo que imprime la otra (por ejemplo: cocina en la de cocina, tickets y cortes en la de caja).'}
          </p>
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

      <PrinterCard station={station} />

      {!station.printer && <KioskInstructions />}

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
                  <JobRow key={job.id} job={job} isNext={job.id === nextId} otherDevice={!jobMatchesKinds(job, kinds)} {...rowProps} />
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

    </div>
  );
}

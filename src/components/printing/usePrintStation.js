// State and actions of the print station: queue loading (realtime plus a 10 s
// polling fallback, since websockets can drop), claiming, printing and the
// follow-up calls. Kept out of the page so Impresion.jsx stays layout only.
//
// Nothing here ever reprints by itself: only `pendiente` jobs are claimed
// automatically, and only while auto print is on. Reprints are explicit.
//
// Two ways out to paper. With a USB printer connected (WebUSB) the job goes
// straight to it as ESC/POS: no driver, no dialog, and a failure is a real
// failure. Without one, the old path: paint the print area and window.print().
//
// One instance for the whole app (PrintStationProvider in Layout). A device
// with a USB printer prints from ANY screen, and auto print defaults to on
// there: a ticket asked for from Cobro must come out without anyone opening
// Impresión. Without a USB printer it only works while Impresión is open
// (`pageOpen`), since window.print() would pop a dialog in the middle of a
// sale. A Web Lock keeps two tabs of the same device from printing the same
// job.
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { base44 } from '@/api/base44Client';
import { callFn } from '@/lib/api';
import { toast } from '@/components/ui/use-toast';
import { eventRow, getDeviceId, readAutoPref, writeAutoPref } from './printingHelpers';
import { buildDrawerPulse, buildEscPos, testLines } from './escpos';
import { choosePrinter, findPaired, forget, printerName, sendBytes, usbSupported } from './usbPrinter';

const POLL_MS = 10 * 1000;
const EVENT_DEBOUNCE_MS = 300;

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

const PRINT_LOCK = 'sommel-print-station';

/** Runs `fn` while holding the device-wide print lock; skips if another tab
 *  holds it (that tab is printing). Without Web Locks it just runs. */
async function withPrintLock(fn) {
  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    return navigator.locks.request(PRINT_LOCK, { ifAvailable: true }, (lock) => (lock ? fn() : undefined));
  }
  return fn();
}

export default function usePrintStation(tenantId, { allowed = true, pageOpen = false } = {}) {
  const [deviceId] = useState(getDeviceId);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [lastSync, setLastSync] = useState(null);
  const [autoPref, setAutoState] = useState(readAutoPref);
  const [busy, setBusy] = useState(false);
  const [paperJob, setPaperJob] = useState(null);
  const busyRef = useRef(false);
  const [usb, setUsb] = useState(null);
  const usbRef = useRef(null);
  const setPrinter = useCallback((device) => {
    usbRef.current = device;
    setUsb(device);
  }, []);

  // A printer allowed before reconnects by itself; unplugging drops it and
  // plugging it back picks it up again.
  useEffect(() => {
    if (!usbSupported()) return undefined;
    let alive = true;
    findPaired().then((d) => { if (alive && d) setPrinter(d); });
    const onConnect = (e) => { if (!usbRef.current) setPrinter(e.device); };
    const onDisconnect = (e) => { if (usbRef.current === e.device) setPrinter(null); };
    navigator.usb.addEventListener('connect', onConnect);
    navigator.usb.addEventListener('disconnect', onDisconnect);
    return () => {
      alive = false;
      navigator.usb.removeEventListener('connect', onConnect);
      navigator.usb.removeEventListener('disconnect', onDisconnect);
    };
  }, [setPrinter]);

  // Work only where it can print: a USB printer here, or the Impresión page.
  const enabled = allowed && !!tenantId && (!!usb || pageOpen);
  // Unset preference: on with a USB printer (it is the caja), off otherwise.
  const auto = autoPref ?? !!usb;

  const load = useCallback(async () => {
    try {
      const { jobs: rows } = await callFn('printing', 'queue', { include_done: true });
      setJobs(Array.isArray(rows) ? rows : []);
      setLoadError(null);
      setLastSync(new Date());
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [enabled, load]);

  // Realtime: subscribe() is not filtered by the server, so only events of
  // this bar trigger a (debounced) reload.
  useEffect(() => {
    if (!enabled) return undefined;
    let timer = null;
    const unsub = base44.entities.PrintJob.subscribe((evt) => {
      const row = eventRow(evt);
      if (row?.tenant_id && row.tenant_id !== tenantId) return;
      clearTimeout(timer);
      timer = setTimeout(load, EVENT_DEBOUNCE_MS);
    });
    return () => {
      clearTimeout(timer);
      if (typeof unsub === 'function') unsub();
    };
  }, [enabled, tenantId, load]);

  const setAuto = useCallback((on) => {
    setAutoState(on);
    writeAutoPref(on);
  }, []);

  const fail = useCallback(
    async (job, message) => {
      try {
        await callFn('printing', 'markFailed', { job_id: job.id, device_id: deviceId, error: message });
      } catch (err) {
        toast({ title: 'No se pudo marcar el trabajo', description: err.message, variant: 'destructive' });
      }
    },
    [deviceId],
  );

  // Paints the claimed job into the print area, prints, then confirms.
  const paintAndPrint = useCallback(
    async (job) => {
      const device = usbRef.current;
      if (device) {
        try {
          // A reprint never opens the drawer: the money already went in.
          await sendBytes(device, buildEscPos(job.lines, { openDrawer: !!job.open_drawer && !job.reprint_of }));
        } catch (err) {
          await fail(job, err?.message || 'No se pudo imprimir');
          toast({ title: 'No se pudo imprimir', description: err?.message, variant: 'destructive' });
          return;
        }
        try {
          await callFn('printing', 'markPrinted', { job_id: job.id, device_id: deviceId });
        } catch (err) {
          toast({ title: 'Se imprimió, pero no se pudo confirmar', description: err.message, variant: 'destructive' });
        }
        return;
      }
      flushSync(() => setPaperJob(job));
      await nextFrame();
      try {
        window.print();
      } catch (err) {
        setPaperJob(null);
        await fail(job, err?.message || 'No se pudo abrir la impresión');
        toast({ title: 'No se pudo imprimir', description: 'El trabajo quedó como fallido. Puedes reintentarlo.', variant: 'destructive' });
        return;
      }
      setPaperJob(null);
      try {
        await callFn('printing', 'markPrinted', { job_id: job.id, device_id: deviceId });
      } catch (err) {
        toast({ title: 'Se imprimió, pero no se pudo confirmar', description: err.message, variant: 'destructive' });
      }
    },
    [deviceId, fail],
  );

  // Claim the oldest waiting job and print it.
  const printNext = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await withPrintLock(async () => {
        const { job } = await callFn('printing', 'claimNext', { device_id: deviceId });
        if (job) await paintAndPrint(job);
      });
    } catch (err) {
      toast({ title: 'No se pudo tomar el trabajo', description: err.message, variant: 'destructive' });
    } finally {
      busyRef.current = false;
      setBusy(false);
      load();
    }
  }, [deviceId, paintAndPrint, load]);

  // Auto print: whenever the queue shows a waiting job and nothing is in flight.
  const hasPending = jobs.some((j) => j.status === 'pendiente');
  // Off the Impresión page only the USB path prints (no dialog mid-sale).
  const canAutoPrint = enabled && auto && (!!usb || pageOpen);
  useEffect(() => {
    if (canAutoPrint && hasPending && !busyRef.current) printNext();
  }, [canAutoPrint, hasPending, jobs, printNext]);

  const act = useCallback(
    async (fn, okTitle) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      try {
        await fn();
        if (okTitle) toast({ title: okTitle });
      } catch (err) {
        toast({ title: 'No se pudo completar', description: err.message, variant: 'destructive' });
      } finally {
        busyRef.current = false;
        setBusy(false);
        load();
      }
    },
    [load],
  );

  const retry = useCallback((job) => act(() => callFn('printing', 'retry', { job_id: job.id }), 'Vuelve a la cola'), [act]);
  const reprint = useCallback((job) => act(() => callFn('printing', 'reprint', { job_id: job.id }), 'Copia en la cola'), [act]);
  const confirmPrinted = useCallback(
    (job) => act(() => callFn('printing', 'markPrinted', { job_id: job.id, device_id: deviceId })),
    [act, deviceId],
  );
  const markFailed = useCallback(
    (job) => act(() => callFn('printing', 'markFailed', { job_id: job.id, device_id: deviceId, error: 'Marcado a mano: no salió' })),
    [act, deviceId],
  );

  const connectPrinter = useCallback(async () => {
    try {
      const device = await choosePrinter();
      if (device) {
        setPrinter(device);
        toast({ title: 'Impresora conectada', description: printerName(device) });
      }
    } catch (err) {
      toast({ title: 'No se pudo conectar la impresora', description: err.message, variant: 'destructive' });
    }
  }, [setPrinter]);

  const disconnectPrinter = useCallback(async () => {
    const device = usbRef.current;
    setPrinter(null);
    await forget(device);
  }, [setPrinter]);

  const sendDirect = useCallback(async (bytes, okTitle) => {
    try {
      await sendBytes(usbRef.current, bytes);
      if (okTitle) toast({ title: okTitle });
    } catch (err) {
      toast({ title: 'No se pudo enviar a la impresora', description: err.message, variant: 'destructive' });
    }
  }, []);
  const testPrint = useCallback(() => sendDirect(buildEscPos(testLines()), 'Prueba enviada'), [sendDirect]);
  const openDrawer = useCallback(() => sendDirect(buildDrawerPulse()), [sendDirect]);

  return {
    usbSupported: usbSupported(),
    printer: usb,
    printerName: printerName(usb),
    connectPrinter,
    disconnectPrinter,
    testPrint,
    openDrawer,
    deviceId,
    jobs,
    loading,
    loadError,
    lastSync,
    auto,
    setAuto,
    busy,
    paperJob,
    printNext,
    retry,
    reprint,
    confirmPrinted,
    markFailed,
    reload: load,
  };
}

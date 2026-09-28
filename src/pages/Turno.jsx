// Turno y corte (Entrega 2, contrato §6). Todo pasa por callFn('shifts', ...);
// esta página nunca lee ni escribe Shift, Payment ni CashMovement directo.
//
// Cierre a ciegas: el diálogo pide solo lo contado. Esperado y diferencia
// solo se muestran a quien tiene Turno:ver_corte, y el servidor ni los manda
// al resto.
import React, { useCallback, useEffect, useState } from 'react';
import { Clock, RefreshCw } from 'lucide-react';
import { callFn } from '@/lib/api';
import { usePermission } from '@/lib/usePermission';
import { Button } from '@/components/ui/button';
import OpenShiftCard from '@/components/shifts/OpenShiftCard';
import OpenShiftPanel from '@/components/shifts/OpenShiftPanel';
import CashOutDialog from '@/components/shifts/CashOutDialog';
import CloseShiftDialog from '@/components/shifts/CloseShiftDialog';
import ClosedShiftCard from '@/components/shifts/ClosedShiftCard';
import ShiftHistory from '@/components/shifts/ShiftHistory';

export default function Turno() {
  const { can } = usePermission();
  const canOperate = can('Turno:operar');
  const canCorte = can('Turno:ver_corte');

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [cashOutOpen, setCashOutOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [justClosed, setJustClosed] = useState(null); // respuesta de shifts.close
  const [historyKey, setHistoryKey] = useState(0);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await callFn('shifts', 'current'));
    } catch (err) {
      setError(err.message || 'No se pudo cargar el turno');
    }
  }, []);

  useEffect(() => {
    if (canOperate) load();
  }, [canOperate, load]);

  // Al volver a la pestaña, otro dispositivo pudo abrir o cerrar el turno.
  useEffect(() => {
    if (!canOperate) return undefined;
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !justClosed) load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [canOperate, justClosed, load]);

  if (!canOperate) {
    return <div className="p-6 lg:p-10 text-muted-foreground">No tienes permiso para ver el turno.</div>;
  }

  const handleClosed = (res) => {
    setJustClosed(res);
    setData({ shift: null, cash_outs: [], totals_by_method: [], sales_total: 0 });
    setHistoryKey((k) => k + 1);
  };

  let body;
  if (error) {
    body = (
      <div className="rounded-xl border border-border bg-card p-6 text-center space-y-3">
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={load}>Reintentar</Button>
      </div>
    );
  } else if (!data) {
    body = (
      <div className="flex justify-center py-10">
        <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" />
      </div>
    );
  } else if (justClosed) {
    body = (
      <ClosedShiftCard
        initialShift={justClosed.shift}
        canCorte={canCorte}
        onDone={() => {
          setJustClosed(null);
          load();
        }}
      />
    );
  } else if (!data.shift) {
    body = <OpenShiftCard onOpened={load} onConflict={load} />;
  } else {
    body = (
      <OpenShiftPanel
        data={data}
        canCorte={canCorte}
        onCashOut={() => setCashOutOpen(true)}
        onClose={() => setCloseOpen(true)}
      />
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-10 max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
          <Clock className="w-6 h-6 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-2xl sm:text-3xl font-semibold">Turno</h1>
          <p className="text-muted-foreground mt-0.5">Abre el turno, registra salidas de efectivo y haz el corte.</p>
        </div>
        {!justClosed ? (
          <Button type="button" variant="ghost" size="icon" onClick={load} aria-label="Actualizar">
            <RefreshCw className="w-4 h-4" />
          </Button>
        ) : null}
      </div>

      {body}

      {canCorte && !justClosed ? <ShiftHistory refreshKey={historyKey} /> : null}

      <CashOutDialog open={cashOutOpen} onOpenChange={setCashOutOpen} onDone={load} />
      <CloseShiftDialog open={closeOpen} onOpenChange={setCloseOpen} onClosed={handleClosed} onStale={load} />
    </div>
  );
}

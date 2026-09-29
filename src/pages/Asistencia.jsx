// Asistencia del equipo (contrato §5): horas por persona, marcas del periodo,
// salida olvidada, corrección con nota y restablecer PIN. Quien no tiene
// Asistencia:ver_equipo ve solo lo suyo desde el mismo lugar (el servidor lo
// impone; la UI solo lo refleja).
import React, { useCallback, useEffect, useState } from 'react';
import { CalendarCheck, RefreshCw } from 'lucide-react';
import { callFn } from '@/lib/api';
import { usePermission } from '@/lib/usePermission';
import { Button } from '@/components/ui/button';
import RangePicker, { rangeFor } from '@/components/attendance/RangePicker';
import TotalsList from '@/components/attendance/TotalsList';
import RecordsList from '@/components/attendance/RecordsList';
import CorrectDialog from '@/components/attendance/CorrectDialog';
import ResetPinSection from '@/components/attendance/ResetPinSection';

export default function Asistencia() {
  const { can } = usePermission();
  const canSee = can('Asistencia:checar');
  const canTeam = can('Asistencia:ver_equipo');
  const canCorrect = can('Asistencia:corregir');

  const [range, setRange] = useState(() => rangeFor('semana'));
  const [data, setData] = useState(null);
  const [people, setPeople] = useState([]);
  const [error, setError] = useState(null);
  const [correcting, setCorrecting] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await callFn('attendance', 'records', { from: range.from, to: range.to }));
    } catch (err) {
      setData(null);
      setError(err.message || 'No se pudo cargar la asistencia');
    }
  }, [range.from, range.to]);

  const loadPeople = useCallback(async () => {
    if (!canCorrect) return;
    try {
      const res = await callFn('attendance', 'roster');
      setPeople(res.people || []);
    } catch {
      setPeople([]);
    }
  }, [canCorrect]);

  useEffect(() => {
    if (canSee) load();
  }, [canSee, load]);

  useEffect(() => {
    if (canSee) loadPeople();
  }, [canSee, loadPeople]);

  if (!canSee) {
    return <div className="p-6 lg:p-10 text-muted-foreground">No tienes permiso para ver la asistencia.</div>;
  }

  let body;
  if (error) {
    body = (
      <div className="rounded-xl border border-border bg-card p-6 text-center space-y-3">
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" className="h-11" onClick={load}>Reintentar</Button>
      </div>
    );
  } else if (!data) {
    body = (
      <div className="flex justify-center py-10">
        <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" />
      </div>
    );
  } else {
    body = (
      <>
        <TotalsList totals={data.totals || []} />
        <section className="space-y-2">
          <h2 className="font-display text-lg font-semibold">Marcas</h2>
          <RecordsList records={data.records || []} showName={canTeam} canCorrect={canCorrect} onCorrect={setCorrecting} />
        </section>
      </>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-10 max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
          <CalendarCheck className="w-6 h-6 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-2xl sm:text-3xl font-semibold">Asistencia</h1>
          <p className="text-muted-foreground mt-0.5">
            {canTeam ? 'Horas del equipo, salidas olvidadas y correcciones.' : 'Tus entradas, salidas y horas.'}
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon" className="h-11 w-11" onClick={() => { load(); loadPeople(); }} aria-label="Actualizar">
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      <RangePicker value={range} onChange={setRange} />

      {body}

      {canCorrect ? <ResetPinSection people={people} onDone={loadPeople} /> : null}

      <CorrectDialog
        record={correcting}
        onOpenChange={(v) => !v && setCorrecting(null)}
        onDone={() => { setCorrecting(null); load(); }}
      />
    </div>
  );
}

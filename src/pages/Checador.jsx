// Checador de entrada y salida con PIN (contrato §5). Con Asistencia:ver_equipo
// (admins por defecto) es la tablet compartida: cuadrícula de nombres, teclado
// grande, confirmación y de vuelta a la cuadrícula. Sin ese permiso el servidor
// solo devuelve a quien inició sesión y la pantalla abre directo su teclado.
// Todo pasa por callFn('attendance', ...).
import React, { useCallback, useEffect, useState } from 'react';
import { Fingerprint, KeyRound, RefreshCw } from 'lucide-react';
import { callFn } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import { usePermission } from '@/lib/usePermission';
import { Button } from '@/components/ui/button';
import PersonGrid from '@/components/attendance/PersonGrid';
import PunchEntry from '@/components/attendance/PunchEntry';
import PunchSuccess from '@/components/attendance/PunchSuccess';
import MyPinDialog from '@/components/attendance/MyPinDialog';

const REFRESH_MS = 60_000;

export default function Checador() {
  const { can } = usePermission();
  const { user } = useAuth();
  const canPunch = can('Asistencia:checar');

  const [people, setPeople] = useState(null);
  const [seeTeam, setSeeTeam] = useState(false);
  const [error, setError] = useState(null);
  const [picked, setPicked] = useState(null); // persona con el teclado abierto
  const [result, setResult] = useState(null); // respuesta de punch
  const [pinOpen, setPinOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await callFn('attendance', 'roster');
      setPeople(res.people || []);
      setSeeTeam(!!res.see_team);
    } catch (err) {
      setError(err.message || 'No se pudo cargar el equipo');
    }
  }, []);

  useEffect(() => {
    if (canPunch) load();
  }, [canPunch, load]);

  // La tablet se queda abierta todo el día: refresca el estado de la cuadrícula.
  useEffect(() => {
    if (!canPunch) return undefined;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible' && !picked && !result) load();
    }, REFRESH_MS);
    return () => clearInterval(t);
  }, [canPunch, picked, result, load]);

  const backToGrid = useCallback(() => {
    setResult(null);
    setPicked(null);
    load();
  }, [load]);

  if (!canPunch) {
    return <div className="p-6 lg:p-10 text-muted-foreground">No tienes permiso para usar el checador.</div>;
  }

  const me = people?.find((p) => p.user_id === user?.id);
  // Without the team permission there is only one person: the one signed in.
  const solo = !!people && !seeTeam;
  const current = picked ?? (solo ? me : null);

  let body;
  if (result) {
    body = <PunchSuccess result={result} onDone={backToGrid} />;
  } else if (solo && !me) {
    body = (
      <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        Tu usuario no aparece en el equipo de este bar. Pide a quien administra el bar que te agregue.
      </div>
    );
  } else if (current) {
    body = (
      <PunchEntry
        person={current}
        onBack={solo ? undefined : () => setPicked(null)}
        onDone={setResult}
        onNeedPin={() => setPinOpen(true)}
        isSelf={current.user_id === user?.id}
      />
    );
  } else if (error) {
    body = (
      <div className="rounded-xl border border-border bg-card p-6 text-center space-y-3">
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" className="h-11" onClick={load}>Reintentar</Button>
      </div>
    );
  } else if (!people) {
    body = (
      <div className="flex justify-center py-10">
        <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" />
      </div>
    );
  } else {
    body = <PersonGrid people={people} onPick={setPicked} />;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-10 max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
          <Fingerprint className="w-6 h-6 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-2xl sm:text-3xl font-semibold">Checador</h1>
          <p className="text-muted-foreground mt-0.5">
            {solo
              ? 'Escribe tu PIN para registrar tu entrada o salida.'
              : 'Toca tu nombre y escribe tu PIN para registrar entrada o salida.'}
          </p>
        </div>
        {!result && (solo || !picked) ? (
          <>
            <Button type="button" variant="outline" className="h-11" onClick={() => setPinOpen(true)}>
              <KeyRound className="w-4 h-4" /> <span className="hidden min-[420px]:inline">Mi PIN</span>
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-11 w-11" onClick={load} aria-label="Actualizar">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </>
        ) : null}
      </div>

      {body}

      <MyPinDialog open={pinOpen} onOpenChange={setPinOpen} hasPin={!!me?.has_pin} onDone={load} />
    </div>
  );
}

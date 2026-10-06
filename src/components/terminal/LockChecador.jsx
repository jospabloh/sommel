// Checador from the terminal's lock screen: anyone of the team clocks in or
// out with their OWN PIN without unlocking the terminal (the server allows
// attendance.roster/punch on a locked terminal for exactly this).
import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { callFn } from '@/lib/api';
import { Button } from '@/components/ui/button';
import PersonGrid from '@/components/attendance/PersonGrid';
import PunchEntry from '@/components/attendance/PunchEntry';
import PunchSuccess from '@/components/attendance/PunchSuccess';

export default function LockChecador({ onExit }) {
  const [people, setPeople] = useState(null);
  const [error, setError] = useState(null);
  const [picked, setPicked] = useState(null);
  const [result, setResult] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await callFn('attendance', 'roster');
      setPeople(res.people || []);
    } catch (err) {
      setError(err.message || 'No se pudo cargar el equipo');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // After a punch, back to the lock screen: the terminal is shared.
  const done = useCallback(() => onExit(), [onExit]);

  let body;
  if (result) {
    body = <PunchSuccess result={result} onDone={done} />;
  } else if (picked) {
    body = (
      <PunchEntry
        person={picked}
        onBack={() => setPicked(null)}
        onDone={setResult}
        onNeedPin={() => {}}
        isSelf={false}
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
      <div className="flex justify-center py-10" role="status" aria-label="Cargando">
        <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" />
      </div>
    );
  } else {
    body = <PersonGrid people={people} onPick={setPicked} />;
  }

  return (
    <div className="space-y-5">
      {!result && !picked ? (
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" className="h-11 -ml-2" onClick={onExit}>
            <ArrowLeft className="w-4 h-4" /> Volver
          </Button>
          <h1 className="font-display text-2xl font-semibold">Checar entrada o salida</h1>
        </div>
      ) : null}
      {body}
    </div>
  );
}

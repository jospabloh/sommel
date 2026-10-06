// "¿Quién eres?" (docs/modo-terminal-diseno.md): what a terminal shows while
// nobody has unlocked it. Buttons for who is on shift and the admins, the rest
// behind "Otra persona", then the person's PIN.
import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Monitor, UserRound } from 'lucide-react';
import { callFn } from '@/lib/api';
import { setUnlocked } from '@/lib/terminal/terminalStore';
import { Button } from '@/components/ui/button';
import PinPad, { PIN_MIN } from '@/components/attendance/PinPad';
import CameraPreview from '@/components/security/CameraPreview';
import { usePhotoCapture } from '@/lib/camera/usePhotoCapture';

function unlockError(err) {
  if (err.code === 'wrong_pin') return 'PIN incorrecto. Inténtalo de nuevo.';
  if (err.code === 'pin_locked') return err.message || 'Demasiados intentos. Espera unos minutos.';
  if (err.code === 'no_pin') return 'Esta persona todavía no crea su PIN. Créalo en Checador desde tu cuenta.';
  return err.message || 'No se pudo entrar. Intenta de nuevo.';
}

function PersonButton({ person, onPick }) {
  return (
    <button
      type="button"
      onClick={() => onPick(person)}
      className="h-24 rounded-2xl border border-border bg-card px-3 text-left hover:bg-secondary active:bg-accent/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="block font-display text-lg font-semibold leading-tight break-words">{person.name}</span>
      <span className="block text-sm text-muted-foreground mt-1">
        {person.on_shift ? 'En turno' : person.app_role === 'bar_admin' ? 'Admin' : 'Fuera de turno'}
      </span>
    </button>
  );
}

export default function TerminalLock() {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [person, setPerson] = useState(null);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [pinError, setPinError] = useState(null);
  const camera = usePhotoCapture(!!person?.photo_check);

  const load = useCallback(async () => {
    setError(null);
    try {
      setInfo(await callFn('terminals', 'whoAmI'));
    } catch (err) {
      setError(err.message || 'No se pudo cargar la terminal');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    if (busy || pin.length < PIN_MIN || !person) return;
    setBusy(true);
    setPinError(null);
    try {
      const photo = person.photo_check ? camera.capture() : null;
      setUnlocked(await callFn('terminals', 'unlock', { user_id: person.id, pin, ...(photo ? { photo } : {}) }));
    } catch (err) {
      setPinError(unlockError(err));
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  const people = info?.people ?? [];
  const featured = people.filter((p) => p.featured);
  const rest = people.filter((p) => !p.featured);
  const shown = showAll || featured.length === 0 ? people : featured;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="flex items-center gap-3 px-4 sm:px-8 h-16 border-b border-border">
        <Monitor className="w-5 h-5 text-primary shrink-0" />
        <div className="min-w-0">
          <p className="font-display font-semibold truncate">{info?.bar?.name || 'Sommel'}</p>
          <p className="text-xs text-muted-foreground truncate">Terminal {info?.terminal?.name || ''}</p>
        </div>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-8 py-8">
        {error ? (
          <div className="rounded-xl border border-border bg-card p-6 text-center space-y-3">
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" onClick={load}>Reintentar</Button>
          </div>
        ) : !info ? (
          <div className="flex justify-center py-16" role="status" aria-label="Cargando">
            <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" />
          </div>
        ) : person ? (
          <div className="max-w-sm mx-auto space-y-5">
            <Button type="button" variant="ghost" className="h-11 -ml-2" onClick={() => { setPerson(null); setPin(''); setPinError(null); }}>
              <ArrowLeft className="w-4 h-4" /> Volver
            </Button>
            <div className="text-center space-y-1">
              <h2 className="font-display text-2xl font-semibold">{person.name}</h2>
              <p className="text-muted-foreground">Escribe tu PIN para entrar</p>
            </div>
            <CameraPreview videoRef={camera.videoRef} status={camera.status} />
            <PinPad value={pin} onChange={(v) => { setPin(v); setPinError(null); }} onSubmit={submit} disabled={busy} />
            <p className="text-center text-sm text-destructive min-h-[1.25rem]" role="alert" aria-live="polite">{pinError}</p>
          </div>
        ) : (
          <div className="space-y-6">
            <h1 className="font-display text-3xl font-semibold text-center">¿Quién eres?</h1>
            {people.length === 0 ? (
              <div className="rounded-xl border border-border bg-card p-6 text-center space-y-2">
                <UserRound className="w-8 h-8 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Nadie puede entrar todavía: cada persona necesita su PIN. Créalo en Checador desde tu cuenta.
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {shown.map((p) => <PersonButton key={p.id} person={p} onPick={setPerson} />)}
                </div>
                {!showAll && rest.length > 0 && featured.length > 0 ? (
                  <div className="text-center">
                    <Button type="button" variant="outline" className="h-12" onClick={() => setShowAll(true)}>
                      Otra persona
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// Pantalla de PIN para una persona: teclado grande, envío al servidor y
// errores en español. Al terminar bien llama onDone(respuesta).
import React, { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { callFn } from '@/lib/api';
import { Button } from '@/components/ui/button';
import PinPad, { PIN_MIN } from './PinPad';

function errorText(err) {
  if (err.code === 'wrong_pin') return 'PIN incorrecto. Inténtalo de nuevo.';
  if (err.code === 'pin_locked') return err.message || 'Demasiados intentos. Espera unos minutos.';
  if (err.code === 'no_pin') return 'Esta persona todavía no crea su PIN.';
  if (err.code === 'read_only') return 'El bar está en modo solo lectura. No se pueden registrar marcas.';
  return err.message || 'No se pudo registrar. Intenta de nuevo.';
}

export default function PunchEntry({ person, onBack, onDone, onNeedPin, isSelf }) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    if (busy || pin.length < PIN_MIN) return;
    setBusy(true);
    setError(null);
    try {
      const res = await callFn('attendance', 'punch', { user_id: person.user_id, pin });
      onDone(res);
    } catch (err) {
      setError(errorText(err));
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {onBack ? (
        <Button type="button" variant="ghost" onClick={onBack} className="h-11 -ml-2">
          <ArrowLeft className="w-4 h-4" /> Volver
        </Button>
      ) : null}
      <div className="text-center space-y-1">
        <h2 className="font-display text-2xl font-semibold">{person.name}</h2>
        <p className="text-muted-foreground">
          {person.inside ? 'Escribe tu PIN para registrar tu salida' : 'Escribe tu PIN para registrar tu entrada'}
        </p>
      </div>
      <PinPad value={pin} onChange={(v) => { setPin(v); setError(null); }} onSubmit={submit} disabled={busy} />
      <p className="text-center text-sm text-destructive min-h-[1.25rem]" role="alert" aria-live="polite">
        {error}
      </p>
      {!person.has_pin ? (
        <p className="text-center text-sm text-muted-foreground">
          Esta persona todavía no tiene PIN.{' '}
          {isSelf ? (
            <button type="button" className="underline text-primary" onClick={onNeedPin}>
              Crear PIN
            </button>
          ) : (
            'Debe crearlo desde su propia sesión (botón Mi PIN).'
          )}
        </p>
      ) : null}
    </div>
  );
}

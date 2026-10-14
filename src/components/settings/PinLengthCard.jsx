// Ajustes: largo de los PINs del bar (4 por defecto). El teclado entra solo al
// teclear el último dígito, así que todos los PINs miden lo mismo. Cambiarlo
// no rehace los PINs ya puestos: quien tenga otro largo debe volver a ponerlo.
import React, { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { callFn } from '@/lib/api';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

const LENGTHS = [4, 5, 6];

export default function PinLengthCard({ bar, onSaved }) {
  const current = LENGTHS.includes(bar.pin_length) ? bar.pin_length : 4;
  const [busy, setBusy] = useState(false);

  const choose = async (n) => {
    if (n === current || busy) return;
    setBusy(true);
    try {
      const { bar: fresh } = await callFn('settings', 'update', { pin_length: n });
      onSaved(fresh);
      toast({ title: `Los PIN ahora son de ${n} números`, description: 'Quien tenga un PIN de otro largo debe volver a ponerlo en Checador (Mi PIN) o en Staff.' });
    } catch (err) {
      toast({ title: 'No se pudo guardar', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4 sm:p-5 space-y-4">
      <div className="flex items-start gap-2">
        <KeyRound className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div>
          <h2 className="font-display text-lg font-semibold">PIN del equipo</h2>
          <p className="text-sm text-muted-foreground">
            Cuántos números tiene el PIN de todos. Al escribir el último número entra solo, sin botón.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Largo del PIN">
        {LENGTHS.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={current === n}
            disabled={busy}
            onClick={() => choose(n)}
            className={cn(
              'h-12 rounded-lg border text-sm font-medium disabled:opacity-50',
              current === n ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-secondary'
            )}
          >
            {n} números
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Si lo cambias, quien ya tenga un PIN de otro largo tendrá que volver a ponerlo.
      </p>
    </div>
  );
}

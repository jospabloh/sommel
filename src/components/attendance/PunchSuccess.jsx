// Confirmación de una marca; vuelve sola a la cuadrícula tras ~3 s.
import React, { useEffect } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fmtTime } from './helpers';

export const SUCCESS_MS = 3000;

export default function PunchSuccess({ result, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, SUCCESS_MS);
    return () => clearTimeout(t);
  }, [onDone]);

  const isIn = result.action === 'entrada';
  const at = isIn ? result.record?.clock_in : result.record?.clock_out;
  return (
    <div className="text-center space-y-4 py-10" role="status" aria-live="polite">
      <CheckCircle2 className="w-20 h-20 text-primary mx-auto" />
      <p className="font-display text-3xl font-semibold">
        {isIn ? 'Entrada' : 'Salida'} {fmtTime(at)}
      </p>
      <p className="text-xl text-muted-foreground">{result.name}</p>
      <Button type="button" variant="outline" className="h-11 px-6" onClick={onDone}>
        Listo
      </Button>
    </div>
  );
}

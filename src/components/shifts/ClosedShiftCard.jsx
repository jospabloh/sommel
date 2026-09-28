// Resultado del cierre. Sin Turno:ver_corte solo confirma que el conteo quedó
// registrado y el estado del correo: ni esperado ni diferencia.
import React, { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatMXN } from '@/lib/money';
import CorteSummary from './CorteSummary';
import CorteActions from './CorteActions';

export default function ClosedShiftCard({ initialShift, canCorte, onDone }) {
  const [shift, setShift] = useState(initialShift);
  return (
    <div className="bg-card border border-border rounded-xl p-4 sm:p-5 space-y-5">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="w-6 h-6 text-primary shrink-0 mt-0.5" />
        <div>
          <h2 className="font-display text-lg font-semibold">Turno cerrado</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Tu conteo quedó registrado{shift.counted_cash != null ? `: ${formatMXN(shift.counted_cash)}` : ''}.
          </p>
        </div>
      </div>
      <CorteActions shift={shift} canCorte={canCorte} onEmailChanged={(patch) => setShift((s) => ({ ...s, ...patch }))} />
      {canCorte && shift.summary ? <CorteSummary summary={shift.summary} comment={shift.close_comment} /> : null}
      <Button type="button" className="w-full h-12 text-base" onClick={onDone}>
        Listo
      </Button>
    </div>
  );
}

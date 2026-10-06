// Aviso de renglón cancelado dentro de una orden abierta (contrato §5:
// "aviso visible de cancelaciones ('CAMBIO')"). Se queda visible hasta que
// alguien en esta pantalla lo reconoce con el botón — reconocimiento LOCAL
// (estado del componente, no se guarda en el servidor ni en localStorage):
// si la persona recarga o dos tablets están abiertas, cada una decide por su
// cuenta, que es justo lo que "hasta ser reconocido" pide sin inventar un
// campo nuevo en OrderItem para llevar ese estado.
import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function CancelledNotice({ item, onAcknowledge }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border-2 border-destructive bg-destructive/15 px-3 py-3 sm:gap-3 sm:px-4">
      <AlertTriangle className="w-6 h-6 text-destructive shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-destructive sm:text-base sm:tracking-wide">CAMBIO / CANCELADO</div>
        <div className="text-sm font-medium break-words">{item.name}</div>
        {item.cancel_reason && (
          <div className="text-sm text-muted-foreground mt-0.5">Motivo: {item.cancel_reason}</div>
        )}
      </div>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="shrink-0 border-destructive/50"
        aria-label="Enterado, ocultar aviso"
        onClick={onAcknowledge}
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}

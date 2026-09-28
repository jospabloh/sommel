// Historial de movimientos de un insumo (inventory.movements). El costo llega
// redactado del servidor cuando falta Menú:ver_costos.
import React, { useEffect, useState } from 'react';
import { callFn } from '@/lib/api';
import { formatMXN } from '@/lib/money';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MOVEMENT_LABELS, formatSignedQty, formatWhen, unitShort } from './helpers';

export default function MovementsDialog({ item, onOpenChange }) {
  const open = !!item;
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!item) return undefined;
    let cancelled = false;
    setRows(null);
    setError(null);
    callFn('inventory', 'movements', { item_id: item.id, limit: 50 })
      .then((res) => { if (!cancelled) setRows(res.movements || []); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [item]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Historial de {item?.name}</DialogTitle>
          <DialogDescription>Últimos movimientos, del más reciente al más antiguo.</DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : rows === null ? (
          <div className="flex justify-center py-8">
            <div className="w-7 h-7 border-4 border-border border-t-primary rounded-full animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay movimientos.</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((m) => (
              <li key={m.id} className="py-2.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{MOVEMENT_LABELS[m.type] || m.type}</div>
                  <div className="text-xs text-muted-foreground break-words">
                    {formatWhen(m.created_date)}
                    {m.created_by ? ` · ${m.created_by}` : ''}
                    {typeof m.unit_cost === 'number' ? ` · ${formatMXN(m.unit_cost)} c/u` : ''}
                  </div>
                  {m.reason && <div className="text-xs text-muted-foreground italic break-words">{m.reason}</div>}
                </div>
                <div className={cn('text-sm font-semibold shrink-0', m.qty < 0 && 'text-destructive')}>
                  {formatSignedQty(m.qty)} {unitShort(item.unit)}
                </div>
              </li>
            ))}
          </ul>
        )}
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
      </DialogContent>
    </Dialog>
  );
}

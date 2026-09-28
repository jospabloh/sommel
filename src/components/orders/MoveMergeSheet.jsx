// Mover la comanda a otra mesa, o unirla con otra comanda abierta (contrato
// §4 orders.moveTable/mergeOrders, §5 "mover/unir mesas"). La comanda actual
// siempre sobrevive: al unir, la otra se cierra y sus renglones pasan aquí.
import React, { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ArrowRightLeft, Merge } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMXN } from '@/lib/money';

export default function MoveMergeSheet({ open, onOpenChange, order, freeTables, mergeCandidates, onMove, onMerge, submitting }) {
  const [tab, setTab] = useState('move');

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="text-left">
          <SheetTitle>Mover o unir mesas</SheetTitle>
        </SheetHeader>

        {order?.type === 'mesa' && (
          <div className="flex gap-2 mt-4 mb-4">
            <button
              type="button"
              onClick={() => setTab('move')}
              className={cn(
                'flex-1 h-10 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5',
                tab === 'move' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              )}
            >
              <ArrowRightLeft className="w-4 h-4" /> Mover
            </button>
            <button
              type="button"
              onClick={() => setTab('merge')}
              className={cn(
                'flex-1 h-10 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5',
                tab === 'merge' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              )}
            >
              <Merge className="w-4 h-4" /> Unir
            </button>
          </div>
        )}

        {tab === 'move' && order?.type === 'mesa' ? (
          freeTables.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No hay mesas libres.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {freeTables.map((t) => (
                <Button key={t.id} variant="outline" className="h-12" disabled={submitting} onClick={() => onMove(t.id)}>
                  {t.name}
                </Button>
              ))}
            </div>
          )
        ) : mergeCandidates.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No hay otra comanda abierta para unir.</p>
        ) : (
          <div className="space-y-2">
            {mergeCandidates.map((o) => (
              <button
                key={o.id}
                type="button"
                disabled={submitting}
                onClick={() => onMerge(o.id)}
                className="w-full flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left hover:border-primary/50 disabled:opacity-50"
              >
                <div className="min-w-0">
                  <div className="font-medium truncate">
                    {o.type === 'llevar' ? o.customer_name || 'Para llevar' : o.table_label || 'Mesa'}
                  </div>
                  <div className="text-xs text-muted-foreground">{o.type === 'llevar' ? 'Para llevar' : 'Mesa'}</div>
                </div>
                <div className="text-sm font-medium shrink-0">{formatMXN(o.total)}</div>
              </button>
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

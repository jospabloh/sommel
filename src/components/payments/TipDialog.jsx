// Propina (payments.setTip): porcentaje o monto. Los botones rapidos (10, 15,
// 20 %) son para quien cobra cuando el cliente ya dijo cuanto deja; nada se
// sugiere ni se imprime al cliente (contrato entrega 2, seccion 0). Un toque
// guarda. "Quitar" borra la propina. El servidor calcula el monto final.
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { formatMXN, pesosToCents } from '@/lib/money';

export const QUICK_TIP_PCTS = [10, 15, 20];

export default function TipDialog({ open, onOpenChange, hasTip, currentPct, base, onConfirm, submitting }) {
  const [kind, setKind] = useState('pct');
  const [value, setValue] = useState('');

  const handleOpenChange = (v) => {
    if (!v) {
      setKind('pct');
      setValue('');
    }
    onOpenChange(v);
  };

  const num = Number(value);
  const valid = value !== '' && Number.isFinite(num) && num >= 0;

  const handleConfirm = () => {
    if (!valid) return;
    onConfirm(kind === 'pct' ? { pct: num } : { amount: pesosToCents(num) });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Propina</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {QUICK_TIP_PCTS.map((pct) => (
              <button
                key={pct}
                type="button"
                disabled={submitting}
                onClick={() => onConfirm({ pct })}
                className={cn(
                  'h-16 rounded-xl border text-center transition-colors disabled:opacity-50',
                  currentPct === pct
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card hover:bg-muted'
                )}
              >
                <span className="block text-lg font-semibold">{pct}%</span>
                {base > 0 && (
                  <span className={cn('block text-xs', currentPct === pct ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                    {formatMXN(Math.round((base * pct) / 100))}
                  </span>
                )}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Otra cantidad:</p>
          <div className="flex gap-2">
            {[
              { id: 'pct', label: 'Porcentaje' },
              { id: 'amount', label: 'Monto' },
            ].map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setKind(o.id)}
                className={cn(
                  'flex-1 h-10 rounded-lg text-sm font-medium',
                  kind === o.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tip-value">{kind === 'pct' ? 'Porcentaje (%)' : 'Monto en pesos'}</Label>
            <Input
              id="tip-value"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value.replace(/[^0-9.]/g, ''))}
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          {hasTip && (
            <Button variant="ghost" disabled={submitting} onClick={() => onConfirm({})}>
              Quitar propina
            </Button>
          )}
          <Button onClick={handleConfirm} disabled={!valid || submitting}>
            {submitting ? 'Guardando…' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Propina (payments.setTip): porcentaje o monto, sin porcentaje sugerido
// (contrato entrega 2, seccion 0). Vacio y "Quitar" borran la propina.
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { pesosToCents } from '@/lib/money';

export default function TipDialog({ open, onOpenChange, hasTip, onConfirm, submitting }) {
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
              autoFocus
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

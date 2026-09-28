// Descuento o cortesia (payments.applyDiscount). Solo se ofrece con
// `Cobro:descuento`; el motivo es obligatorio salvo al quitarlo.
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { pesosToCents } from '@/lib/money';

const OPTIONS = [
  { id: 'pct', label: 'Porcentaje' },
  { id: 'amount', label: 'Monto' },
  { id: 'cortesia', label: 'Cortesía' },
];

export default function DiscountDialog({ open, onOpenChange, hasDiscount, onConfirm, submitting }) {
  const [kind, setKind] = useState('pct');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');

  const handleOpenChange = (v) => {
    if (!v) {
      setKind('pct');
      setValue('');
      setReason('');
    }
    onOpenChange(v);
  };

  const needsValue = kind === 'pct' || kind === 'amount';
  const num = Number(value);
  const valid = reason.trim() && (!needsValue || (value !== '' && Number.isFinite(num) && num > 0));

  const handleConfirm = () => {
    if (!valid) return;
    if (kind === 'cortesia') onConfirm({ kind: 'cortesia', reason: reason.trim() });
    else if (kind === 'pct') onConfirm({ kind: 'descuento', pct: num, reason: reason.trim() });
    else onConfirm({ kind: 'descuento', amount: pesosToCents(num), reason: reason.trim() });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Descuento o cortesía</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-2">
            {OPTIONS.map((o) => (
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
          {needsValue && (
            <div className="space-y-1.5">
              <Label htmlFor="discount-value">{kind === 'pct' ? 'Porcentaje (%)' : 'Monto en pesos'}</Label>
              <Input
                id="discount-value"
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(e.target.value.replace(/[^0-9.]/g, ''))}
                placeholder={kind === 'pct' ? 'p. ej. 10' : 'p. ej. 50'}
                autoFocus
              />
            </div>
          )}
          {kind === 'cortesia' && (
            <p className="text-sm text-muted-foreground">La cuenta completa queda sin costo. Necesita un motivo.</p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="discount-reason">Motivo (obligatorio)</Label>
            <Textarea
              id="discount-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="p. ej. cliente frecuente"
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          {hasDiscount && (
            <Button variant="ghost" disabled={submitting} onClick={() => onConfirm({ kind: 'ninguno' })}>
              Quitar descuento
            </Button>
          )}
          <Button onClick={handleConfirm} disabled={!valid || submitting}>
            {submitting ? 'Aplicando…' : 'Aplicar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

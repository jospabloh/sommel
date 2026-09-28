// Anular un pago (payments.voidPayment): motivo obligatorio. Solo se ofrece
// con `Cobro:anular_pago`; si la cuenta estaba cobrada, se reabre.
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { formatMXN } from '@/lib/money';

export default function VoidPaymentDialog({ open, onOpenChange, payment, reopens, onConfirm, submitting }) {
  const [reason, setReason] = useState('');

  const handleOpenChange = (v) => {
    if (!v) setReason('');
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Anular pago de {payment ? formatMXN(payment.amount) : ''}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {reopens && (
            <p className="text-sm text-muted-foreground">La cuenta ya estaba cobrada. Al anular, vuelve a quedar abierta.</p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="void-reason">Motivo (obligatorio)</Label>
            <Textarea
              id="void-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="p. ej. se cobró con la forma de pago equivocada"
              autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            Volver
          </Button>
          <Button variant="destructive" disabled={!reason.trim() || submitting} onClick={() => onConfirm(reason.trim())}>
            {submitting ? 'Anulando…' : 'Anular pago'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

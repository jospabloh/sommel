// Anular un retiro de efectivo registrado por error (shifts.voidCashOut). Solo
// del turno abierto; el personal necesita la aprobación de un administrador,
// que pide callFn por su cuenta.
import React, { useState } from 'react';
import { callFn } from '@/lib/api';
import { formatMXN } from '@/lib/money';
import { toast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useLastValue } from '@/lib/useLastValue';

export default function VoidCashOutDialog({ movement: movementProp, onOpenChange, onDone }) {
  const movement = useLastValue(movementProp);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const close = () => {
    setReason('');
    onOpenChange(false);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!reason.trim() || busy || !movement) return;
    setBusy(true);
    try {
      await callFn('shifts', 'voidCashOut', { movement_id: movement.id, reason: reason.trim() });
      toast({ title: 'Retiro anulado' });
      close();
      onDone();
    } catch (err) {
      if (err?.code !== 'approval_cancelled') {
        toast({ title: 'No se pudo anular el retiro', description: err.message, variant: 'destructive' });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!movementProp} onOpenChange={(v) => !v && !busy && close()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Anular retiro</DialogTitle>
          <DialogDescription>
            {movement ? `${formatMXN(Math.abs(movement.amount ?? 0))} · ${movement.reason ?? ''}` : ''}. Deja de contar en el corte y en el efectivo esperado.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="void-cashout-reason">Motivo (obligatorio)</Label>
            <Input id="void-cashout-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} autoFocus />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={close} disabled={busy}>Volver</Button>
            <Button type="submit" variant="destructive" disabled={!reason.trim() || busy}>
              {busy ? 'Anulando…' : 'Anular retiro'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

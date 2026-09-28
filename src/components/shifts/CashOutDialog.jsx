// Salida de efectivo (contrato §5 shifts.addCashOut): monto y motivo
// obligatorios. La llave de idempotencia se genera UNA vez por intento y se
// reutiliza en reintentos; se regenera solo tras éxito o al cambiar monto o
// motivo (contrato §6).
import React, { useRef, useState } from 'react';
import { callFn } from '@/lib/api';
import { toast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import MoneyField from './MoneyField';
import { newKey, parsePesos } from './helpers';

export default function CashOutDialog({ open, onOpenChange, onDone }) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const keyRef = useRef(newKey());

  const cents = parsePesos(amount);
  const canSubmit = cents !== null && cents > 0 && reason.trim().length > 0 && !busy;

  const reset = () => {
    setAmount('');
    setReason('');
    keyRef.current = newKey();
  };

  const handleOpenChange = (v) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    try {
      await callFn('shifts', 'addCashOut', {
        amount: cents,
        reason: reason.trim(),
        idempotency_key: keyRef.current,
      });
      toast({ title: 'Salida registrada' });
      reset();
      onOpenChange(false);
      onDone();
    } catch (err) {
      toast({ title: 'No se pudo registrar la salida', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Salida de efectivo</DialogTitle>
          <DialogDescription>Dinero que sale de la caja durante el turno, con su motivo.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <MoneyField
            id="cashout-amount"
            label="Monto"
            value={amount}
            onChange={(v) => {
              setAmount(v);
              keyRef.current = newKey();
            }}
            autoFocus
          />
          <div className="space-y-1.5">
            <Label htmlFor="cashout-reason">Motivo (obligatorio)</Label>
            <Input
              id="cashout-reason"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                keyRef.current = newKey();
              }}
              maxLength={200}
              placeholder="p. ej. hielo, propina a cocina"
              className="h-11"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
              Volver
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {busy ? 'Guardando…' : 'Registrar salida'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

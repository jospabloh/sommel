// "Mi PIN": crear o cambiar el PIN propio. Si ya existe pide el actual.
import React, { useState } from 'react';
import { callFn } from '@/lib/api';
import { toast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

const digits = (v) => v.replace(/\D/g, '').slice(0, 6);

export default function MyPinDialog({ open, onOpenChange, hasPin, onDone }) {
  const [current, setCurrent] = useState('');
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const reset = () => {
    setCurrent('');
    setPin('');
    setConfirm('');
    setError(null);
  };
  const handleOpenChange = (v) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const validNew = pin.length >= 4 && pin.length <= 6;
  const mismatch = confirm.length > 0 && confirm !== pin;
  const canSubmit = validNew && confirm === pin && (!hasPin || current.length >= 4) && !busy;

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await callFn('attendance', 'setMyPin', hasPin ? { pin, current_pin: current } : { pin });
      toast({ title: hasPin ? 'PIN cambiado' : 'PIN creado' });
      reset();
      onOpenChange(false);
      onDone?.();
    } catch (err) {
      setError(err.message || 'No se pudo guardar el PIN');
    } finally {
      setBusy(false);
    }
  };

  const field = (id, label, value, setter, autoFocus) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        value={value}
        onChange={(e) => setter(digits(e.target.value))}
        className="h-12 text-lg tracking-widest"
        autoFocus={autoFocus}
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{hasPin ? 'Cambiar mi PIN' : 'Crear mi PIN'}</DialogTitle>
          <DialogDescription>De 4 a 6 números. Con él registras tu entrada y tu salida.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {hasPin ? field('pin-current', 'PIN actual', current, setCurrent, true) : null}
          {field('pin-new', 'PIN nuevo', pin, setPin, !hasPin)}
          {field('pin-confirm', 'Repite el PIN nuevo', confirm, setConfirm, false)}
          {mismatch ? <p className="text-sm text-destructive">Los PIN no coinciden.</p> : null}
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="ghost" className="h-11" onClick={() => handleOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" className="h-11" disabled={!canSubmit}>
              {busy ? 'Guardando…' : 'Guardar PIN'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

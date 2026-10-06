// Staff → cambiar el PIN de alguien sin correo (terminals.setPersonPin). Quien
// tiene correo pone su propio PIN en el checador; esto es solo para quien no
// puede entrar a Sommel por su cuenta.
import React, { useEffect, useState } from 'react';
import { callFn } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { personName } from '@/lib/rbac';
import { pinProblem } from './pinRules';

export default function PersonPinDialog({ member, onClose, onSaved }) {
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setPin('');
    setPin2('');
    setError('');
  }, [member]);

  const save = async (e) => {
    e.preventDefault();
    const problem = pinProblem(pin, pin2);
    if (problem) return setError(problem);
    setBusy(true);
    setError('');
    try {
      await callFn('terminals', 'setPersonPin', { user_id: member.id, pin });
      onSaved();
    } catch (err) {
      setError(err.message || 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!member} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent>
        <form onSubmit={save} className="space-y-4">
          <DialogHeader>
            <DialogTitle>PIN de {member ? personName(member) : ''}</DialogTitle>
            <DialogDescription>Que la persona escriba su PIN nuevo. Se desbloquea si estaba bloqueado.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            <Input type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} placeholder="PIN" aria-label="PIN" autoFocus />
            <Input type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))} placeholder="Repítelo" aria-label="Repetir PIN" />
          </div>
          <p className="text-sm text-destructive min-h-[1.25rem]" role="alert">{error}</p>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancelar</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

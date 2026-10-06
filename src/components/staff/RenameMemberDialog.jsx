// Staff: the bar admin sets how Sommel names a person (User.display_name,
// server-side through manageStaff.setName). Base44 never lets an account
// change its own full_name after signup, so this is where names get fixed.
import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { personName } from '@/lib/rbac';

export default function RenameMemberDialog({ member, onClose, onSaved }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setName(member ? personName(member) === member.email ? '' : personName(member) : '');
    setError('');
  }, [member]);

  const save = async (e) => {
    e.preventDefault();
    const value = name.trim();
    if (!value) { setError('Escribe un nombre'); return; }
    setBusy(true);
    setError('');
    try {
      await base44.functions.invoke('manageStaff', { action: 'setName', user_id: member.id, name: value });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!member} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent>
        <form onSubmit={save} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Nombre en Sommel</DialogTitle>
            <DialogDescription>
              Así aparece {member?.email} en el checador, la terminal, los reportes y en lo que haga.
            </DialogDescription>
          </DialogHeader>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Nombre y apellido" aria-label="Nombre" autoFocus />
          <p className="text-sm text-destructive min-h-[1.25rem]" role="alert">{error}</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancelar</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

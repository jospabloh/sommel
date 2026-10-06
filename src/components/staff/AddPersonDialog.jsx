// Staff → "Agregar sin correo" (fase 2b, 2026-10-06): alguien que no tiene
// correo (o no quiere darlo) entra solo en las terminales, con su PIN. Sommel le
// crea una cuenta sin buzón (terminals.addPerson). El PIN lo escribe la persona
// en esta pantalla; el admin no necesita verlo.
import React, { useEffect, useState } from 'react';
import { callFn } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BAR_ADMIN, STAFF } from '@/lib/rbac';
import { pinProblem } from './pinRules';

export default function AddPersonDialog({ open, onClose, onSaved }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState(STAFF);
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setName('');
      setRole(STAFF);
      setPin('');
      setPin2('');
      setError('');
    }
  }, [open]);

  const save = async (e) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return setError('Escribe su nombre');
    const problem = pinProblem(pin, pin2);
    if (problem) return setError(problem);
    setBusy(true);
    setError('');
    try {
      const res = await callFn('terminals', 'addPerson', { name: n, app_role: role, pin });
      onSaved(res.person);
    } catch (err) {
      setError(err.message || 'No se pudo agregar');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <form onSubmit={save} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Agregar a alguien sin correo</DialogTitle>
            <DialogDescription>
              Entra solo en las terminales del bar, con su PIN. No puede abrir Sommel desde su celular. Si después
              quiere entrar desde cualquier equipo, invítalo con su correo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label htmlFor="person-name" className="text-sm font-medium">Nombre</label>
            <Input id="person-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Nombre y apellido" autoFocus />
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium" id="person-role">Rol</p>
            <div className="flex gap-2" role="group" aria-labelledby="person-role">
              {[[STAFF, 'Mesero'], [BAR_ADMIN, 'Admin']].map(([value, label]) => (
                <Button key={value} type="button" className="h-11 flex-1" variant={role === value ? 'default' : 'outline'} aria-pressed={role === value} onClick={() => setRole(value)}>
                  {label}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Que la persona escriba su PIN (4 a 6 números)</p>
            <div className="grid grid-cols-2 gap-2">
              <Input type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} placeholder="PIN" aria-label="PIN" />
              <Input type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))} placeholder="Repítelo" aria-label="Repetir PIN" />
            </div>
          </div>
          <p className="text-sm text-destructive min-h-[1.25rem]" role="alert">{error}</p>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancelar</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Agregando…' : 'Agregar'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

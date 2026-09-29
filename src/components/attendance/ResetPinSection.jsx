// "Restablecer PIN" por persona (Asistencia:corregir). Borra el PIN; la
// persona crea uno nuevo desde el checador.
import React, { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { callFn } from '@/lib/api';
import { toast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function ResetPinSection({ people, onDone }) {
  const [target, setTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const withPin = people.filter((p) => p.has_pin);
  if (withPin.length === 0) return null;

  const confirm = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await callFn('attendance', 'resetPin', { user_id: target.user_id });
      toast({ title: 'PIN restablecido', description: `${target.name} creará uno nuevo desde el checador.` });
      setTarget(null);
      onDone();
    } catch (err) {
      toast({ title: 'No se pudo restablecer el PIN', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-2">
      <h2 className="font-display text-lg font-semibold">PIN del equipo</h2>
      <ul className="rounded-xl border border-border bg-card divide-y divide-border">
        {withPin.map((p) => (
          <li key={p.user_id} className="flex items-center gap-3 px-4 py-2 min-h-[56px]">
            <span className="flex-1 min-w-0 truncate">{p.name}</span>
            <Button type="button" variant="outline" className="h-11" onClick={() => setTarget(p)}>
              <KeyRound className="w-4 h-4" /> Restablecer PIN
            </Button>
          </li>
        ))}
      </ul>
      <AlertDialog open={!!target} onOpenChange={(v) => !v && !busy && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Restablecer el PIN de {target?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Su PIN actual se borra. No podrá checar hasta crear uno nuevo desde el checador. Sus horas no cambian.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); confirm(); }}>
              {busy ? 'Restableciendo…' : 'Restablecer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

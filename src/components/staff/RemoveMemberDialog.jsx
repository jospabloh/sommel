import React from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { personName } from '@/lib/rbac';

export default function RemoveMemberDialog({ member, busy, onConfirm, onClose }) {
  const name = member ? personName(member) : '';
  return (
    <AlertDialog open={!!member} onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{`¿Quitar a ${name} del equipo?`}</AlertDialogTitle>
          <AlertDialogDescription>
            Deja de entrar al bar: pierde el acceso a esta cuenta de inmediato. Su PIN del checador se borra
            y, si tiene una entrada abierta, se cierra con la nota "Baja del equipo". Su historial de ventas
            y de horas se queda como está. Si después quieres que regrese, tendrás que invitarlo de nuevo.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
          <Button variant="destructive" disabled={busy} onClick={onConfirm}>
            {busy ? 'Quitando...' : 'Quitar del equipo'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

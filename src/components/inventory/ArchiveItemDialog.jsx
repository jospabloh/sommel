// Confirmation for "Dar de baja" an insumo. The server refuses (409) while
// products are still linked to it; its message names them and is shown as-is.
import React, { useState } from 'react';
import { callFn } from '@/lib/api';
import { useLastValue } from '@/lib/useLastValue';
import { toast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export default function ArchiveItemDialog({ item, linkedCount, onOpenChange, onArchived }) {
  const shown = useLastValue(item);
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (!item || busy) return;
    setBusy(true);
    try {
      await callFn('inventory', 'archiveItem', { item_id: item.id });
      toast({ title: 'Insumo dado de baja', description: item.name });
      onArchived(item.id);
      onOpenChange(false);
    } catch (err) {
      toast({ title: 'No se pudo dar de baja', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!item} onOpenChange={(v) => !v && onOpenChange(false)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Dar de baja {shown?.name}</DialogTitle>
          <DialogDescription>
            Deja de aparecer en el inventario y al ligar productos. Su historial de movimientos se conserva.
          </DialogDescription>
        </DialogHeader>
        {linkedCount > 0 && (
          <p className="text-sm text-destructive">
            Todavía tiene {linkedCount === 1 ? '1 producto ligado' : `${linkedCount} productos ligados`}. Desliga primero esos productos desde "Productos".
          </p>
        )}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Volver</Button>
          <Button type="button" variant="destructive" disabled={busy || linkedCount > 0} onClick={confirm}>
            {busy ? 'Dando de baja…' : 'Dar de baja'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Cancelar un renglón ya enviado (contrato §4 orders.cancelItem): motivo
// obligatorio + "¿ya se preparó?" (para que cocina/barra sepa si genera
// merma, §5 del plan). Solo se ofrece si `Comandas:cancelar_enviado`.
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

export default function CancelItemDialog({ open, onOpenChange, item, onConfirm, submitting }) {
  const [reason, setReason] = useState('');
  const [prepared, setPrepared] = useState(false);

  const handleOpenChange = (v) => {
    if (!v) {
      setReason('');
      setPrepared(false);
    }
    onOpenChange(v);
  };

  const handleConfirm = () => {
    if (!reason.trim()) return;
    onConfirm({ reason: reason.trim(), prepared });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Cancelar {item?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cancel-reason">Motivo (obligatorio)</Label>
            <Textarea
              id="cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="p. ej. el cliente cambió de opinión"
              rows={3}
              autoFocus
            />
          </div>
          <label htmlFor="cancel-prepared" className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
            <span className="text-sm">¿Ya se preparó?</span>
            <Switch id="cancel-prepared" checked={prepared} onCheckedChange={setPrepared} />
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            Volver
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={!reason.trim() || submitting}>
            {submitting ? 'Cancelando…' : 'Cancelar renglón'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Entrada / merma / conteo in one dialog. The idempotency key is created once
// per attempt and reused on retries of that same attempt; it is regenerated
// after success or when the dialog reopens (contract §6).
import React, { useEffect, useRef, useState } from 'react';
import { callFn } from '@/lib/api';
import { pesosToCents, centsToPesos } from '@/lib/money';
import { toast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { formatQty, newKey, parseNumber, unitShort } from './helpers';

const MODES = {
  entrada: {
    title: 'Registrar entrada',
    action: 'addEntry',
    qtyLabel: 'Cantidad que entra',
    reasonLabel: 'Nota (opcional)',
    reasonPlaceholder: 'p. ej. compra con proveedor',
    submit: 'Registrar entrada',
    done: 'Entrada registrada',
  },
  merma: {
    title: 'Registrar merma',
    action: 'addWaste',
    qtyLabel: 'Cantidad perdida',
    reasonLabel: 'Motivo (obligatorio)',
    reasonPlaceholder: 'p. ej. botella rota, caducado',
    submit: 'Registrar merma',
    done: 'Merma registrada',
  },
  conteo: {
    title: 'Conteo físico',
    action: 'count',
    qtyLabel: 'Cantidad contada',
    reasonLabel: 'Nota (opcional)',
    reasonPlaceholder: 'p. ej. cierre de semana',
    submit: 'Guardar conteo',
    done: 'Conteo guardado',
  },
};

export default function MovementDialog({ mode, item, showCost, onOpenChange, onDone }) {
  const open = !!mode && !!item;
  const cfg = MODES[mode] || MODES.entrada;
  const [qty, setQty] = useState('');
  const [cost, setCost] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const keyRef = useRef(newKey());

  useEffect(() => {
    if (open) {
      setQty('');
      setCost(typeof item.unit_cost === 'number' ? String(centsToPesos(item.unit_cost)) : '');
      setReason('');
      keyRef.current = newKey();
    }
  }, [open, item, mode]);

  const qtyNum = parseNumber(qty);
  const costNum = parseNumber(cost);
  const isCount = mode === 'conteo';
  const qtyOk = Number.isFinite(qtyNum) && (isCount ? qtyNum >= 0 : qtyNum > 0);
  const reasonOk = mode !== 'merma' || reason.trim().length > 0;
  const costOk = !showCost || mode !== 'entrada' || cost.trim() === '' || (Number.isFinite(costNum) && costNum >= 0);

  const submit = async (e) => {
    e.preventDefault();
    if (!qtyOk || !reasonOk || !costOk || busy) return;
    setBusy(true);
    try {
      const payload = { item_id: item.id, idempotency_key: keyRef.current };
      if (mode === 'conteo') payload.counted = qtyNum;
      else payload.qty = qtyNum;
      if (reason.trim()) payload.reason = reason.trim();
      if (mode === 'entrada' && showCost && cost.trim() !== '') payload.unit_cost = pesosToCents(costNum);
      const res = await callFn('inventory', cfg.action, payload);
      keyRef.current = newKey();
      toast({ title: cfg.done, description: `${item.name}: ${formatQty(res.item?.stock)} ${unitShort(item.unit)}` });
      onDone(res.item);
      onOpenChange(false);
    } catch (err) {
      // Key stays the same so a retry of this attempt cannot double-write.
      toast({ title: 'No se pudo guardar', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{cfg.title}</DialogTitle>
          <DialogDescription>
            {item?.name} · Existencia actual {formatQty(item?.stock)} {unitShort(item?.unit)}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="inv-qty">{cfg.qtyLabel} ({unitShort(item?.unit)})</Label>
            <Input
              id="inv-qty"
              inputMode="decimal"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              autoFocus
              className="h-11 text-base"
            />
            {isCount && qtyOk && (
              <p className="text-xs text-muted-foreground">
                Diferencia con el sistema: {formatQty(qtyNum - (Number(item?.stock) || 0))} {unitShort(item?.unit)}
              </p>
            )}
          </div>
          {mode === 'entrada' && showCost && (
            <div className="space-y-1.5">
              <Label htmlFor="inv-cost">Costo por {unitShort(item?.unit)} en pesos (opcional)</Label>
              <Input id="inv-cost" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} className="h-11 text-base" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="inv-reason">{cfg.reasonLabel}</Label>
            <Textarea id="inv-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={cfg.reasonPlaceholder} />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Volver</Button>
            <Button type="submit" disabled={!qtyOk || !reasonOk || !costOk || busy}>
              {busy ? 'Guardando…' : cfg.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

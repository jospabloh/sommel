// Alta y edición de un insumo. Nunca captura existencia: esa sale de los
// movimientos (entrada / conteo). El costo solo se muestra con Menú:ver_costos.
import React, { useEffect, useState } from 'react';
import { callFn } from '@/lib/api';
import { pesosToCents, centsToPesos } from '@/lib/money';
import { toast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UNITS, parseNumber } from './helpers';

// item: undefined = closed, null = new, row = edit
export default function ItemFormDialog({ item, showCost, onOpenChange, onSaved }) {
  const open = item !== undefined;
  const editing = !!item;
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('pieza');
  const [threshold, setThreshold] = useState('');
  const [cost, setCost] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(item?.name || '');
    setUnit(item?.unit || 'pieza');
    setThreshold(item ? String(item.low_threshold ?? 0) : '');
    setCost(typeof item?.unit_cost === 'number' ? String(centsToPesos(item.unit_cost)) : '');
  }, [open, item]);

  const thresholdNum = threshold.trim() === '' ? 0 : parseNumber(threshold);
  const costNum = parseNumber(cost);
  const thresholdOk = Number.isFinite(thresholdNum) && thresholdNum >= 0;
  const costOk = !showCost || cost.trim() === '' || (Number.isFinite(costNum) && costNum >= 0);
  const valid = name.trim().length > 0 && thresholdOk && costOk;

  const submit = async (e) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    try {
      const payload = { name: name.trim(), unit, low_threshold: thresholdNum };
      if (editing) payload.id = item.id;
      if (showCost && cost.trim() !== '') payload.unit_cost = pesosToCents(costNum);
      const res = await callFn('inventory', 'upsertItem', payload);
      toast({ title: editing ? 'Insumo actualizado' : 'Insumo creado', description: res.item?.name });
      onSaved(res.item);
      onOpenChange(false);
    } catch (err) {
      toast({ title: 'No se pudo guardar', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onOpenChange(false)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar insumo' : 'Nuevo insumo'}</DialogTitle>
          <DialogDescription>
            {editing ? 'La existencia cambia con entradas, mermas y conteos.' : 'Después registra una entrada o un conteo para fijar la existencia.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="item-name">Nombre</Label>
            <Input id="item-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus className="h-11 text-base" placeholder="p. ej. Malbec Reserva" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="item-unit">Unidad</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger id="item-unit" className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNITS.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="item-min">Avisar en</Label>
              <Input id="item-min" inputMode="decimal" value={threshold} onChange={(e) => setThreshold(e.target.value)} className="h-11 text-base" placeholder="0" />
            </div>
          </div>
          {showCost && (
            <div className="space-y-1.5">
              <Label htmlFor="item-cost">Costo por unidad en pesos (opcional)</Label>
              <Input id="item-cost" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} className="h-11 text-base" />
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Volver</Button>
            <Button type="submit" disabled={!valid || busy}>{busy ? 'Guardando…' : 'Guardar'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

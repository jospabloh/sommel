// Alta/edición de mesa (Mesas:editar → orders.upsertTable/deleteTable,
// contrato §4). No hay pantalla propia para esto en el contrato — vive aquí
// porque BarTable no tiene otro dueño de UI y el endpoint ya existe.
import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Trash2 } from 'lucide-react';
import { callFn } from '@/lib/api';
import { toast } from '@/components/ui/use-toast';

export default function TableFormDialog({ open, onOpenChange, table, onSaved, onDeleted }) {
  const [name, setName] = useState('');
  const [seats, setSeats] = useState('4');
  const [zone, setZone] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (open) {
      setName(table?.name || '');
      setSeats(String(table?.seats ?? 4));
      setZone(table?.zone || '');
    }
  }, [open, table]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const { table: saved } = await callFn('orders', 'upsertTable', {
        id: table?.id,
        name: name.trim(),
        seats: Number(seats) || 0,
        zone: zone.trim() || undefined,
      });
      onSaved?.(saved);
      onOpenChange(false);
    } catch (err) {
      toast({ title: 'No se pudo guardar la mesa', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!table?.id) return;
    setDeleting(true);
    try {
      await callFn('orders', 'deleteTable', { id: table.id });
      onDeleted?.(table.id);
      onOpenChange(false);
    } catch (err) {
      toast({ title: 'No se pudo borrar la mesa', description: err.message, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{table?.id ? 'Editar mesa' : 'Nueva mesa'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="tf-name">Nombre</Label>
            <Input id="tf-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Mesa 1" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tf-seats">Lugares</Label>
              <Input id="tf-seats" type="number" min="1" value={seats} onChange={(e) => setSeats(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tf-zone">Zona</Label>
              <Input id="tf-zone" value={zone} onChange={(e) => setZone(e.target.value)} placeholder="Terraza" />
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 pt-2">
            {table?.id ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={handleDelete}
                disabled={deleting || saving}
              >
                <Trash2 className="w-4 h-4 mr-1.5" /> Borrar
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Alta/edición de una categoría del menú (contrato §4 `catalog.upsertCategory`).
import React, { useEffect, useState } from 'react';
import { callFn, ApiError } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { STATION_OPTIONS } from './menuUtils';

function emptyForm(category, nextSort) {
  return {
    name: category?.name ?? '',
    sort: category ? String(category.sort ?? 0) : String(nextSort ?? 0),
    station_default: category?.station_default ?? 'none',
  };
}

/**
 * @param {{ open: boolean, onOpenChange: (v:boolean)=>void, category?: object,
 *   nextSort?: number, onSaved: (category:object)=>void }} props
 */
export default function CategoryFormDialog({ open, onOpenChange, category, nextSort, onSaved }) {
  const { toast } = useToast();
  const [form, setForm] = useState(() => emptyForm(category, nextSort));
  const [saving, setSaving] = useState(false);
  const [invalidField, setInvalidField] = useState(null);

  useEffect(() => {
    if (open) {
      setForm(emptyForm(category, nextSort));
      setInvalidField(null);
    }
  }, [open, category, nextSort]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) {
      setInvalidField('name');
      toast({ variant: 'destructive', title: 'Revisa este dato', description: 'El nombre de la categoría es obligatorio.' });
      return;
    }
    setInvalidField(null);
    setSaving(true);
    try {
      const res = await callFn('catalog', 'upsertCategory', {
        id: category?.id,
        name,
        sort: Number(form.sort) || 0,
        station_default: form.station_default,
      });
      toast({ title: category ? 'Categoría actualizada' : 'Categoría creada', description: name });
      onSaved?.(res.category);
      onOpenChange(false);
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'No se pudo guardar la categoría',
        description: err instanceof ApiError ? err.message : 'Error de red, intenta de nuevo.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{category ? 'Editar categoría' : 'Nueva categoría'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cat-name">Nombre</Label>
            <Input
              id="cat-name"
              autoFocus
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              aria-invalid={invalidField === 'name'}
              className={invalidField === 'name' ? 'border-destructive' : ''}
              placeholder="p. ej. Tablas"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cat-sort">Orden</Label>
              <Input
                id="cat-sort"
                type="number"
                inputMode="numeric"
                value={form.sort}
                onChange={(e) => setForm((f) => ({ ...f, sort: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Estación por defecto</Label>
              <Select
                value={form.station_default}
                onValueChange={(v) => setForm((f) => ({ ...f, station_default: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATION_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Los productos nuevos de esta categoría empiezan con esta estación;
            cada uno puede cambiarla al darlo de alta.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

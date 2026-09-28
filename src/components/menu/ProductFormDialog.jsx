// Alta/edición de un producto (contrato §4 `catalog.upsertProduct`).
// Dos pasos para el caso simple: elegir categoría (ya viene preseleccionada
// desde la pestaña activa), escribir nombre + precio, guardar. Variantes y
// modificadores son una sección aparte, opcional.
import React, { useEffect, useMemo, useState } from 'react';
import { callFn, ApiError } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { centsToPesos, pesosToCents } from '@/lib/money';
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
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { STATION_OPTIONS, slugify } from './menuUtils';

function centsToPesosInput(cents) {
  return cents === null || cents === undefined ? '' : String(centsToPesos(cents));
}

function buildForm(product, categories, defaultCategoryId) {
  const category = categories.find((c) => c.id === (product?.category_id ?? defaultCategoryId));
  const hasVariants = Array.isArray(product?.variants) && product.variants.length > 0;
  return {
    name: product?.name ?? '',
    category_id: product?.category_id ?? defaultCategoryId ?? categories[0]?.id ?? '',
    station: product?.station ?? category?.station_default ?? 'none',
    hasVariants,
    price: hasVariants ? '' : centsToPesosInput(product?.price),
    cost: hasVariants ? '' : centsToPesosInput(product?.cost),
    variants: hasVariants
      ? product.variants.map((v) => ({
          key: v.key ?? '',
          label: v.label ?? '',
          price: centsToPesosInput(v.price),
          cost: centsToPesosInput(v.cost),
        }))
      : [{ key: '', label: '', price: '', cost: '' }],
    modifiers: Array.isArray(product?.modifiers)
      ? product.modifiers.map((m) => ({ key: m.key ?? '', label: m.label ?? '' }))
      : [],
    active: product?.active ?? true,
    seasonal: product?.seasonal ?? false,
  };
}

/**
 * @param {{ open: boolean, onOpenChange: (v:boolean)=>void, product?: object,
 *   categories: object[], defaultCategoryId?: string, canViewCosts: boolean,
 *   onSaved: () => void }} props
 */
export default function ProductFormDialog({
  open,
  onOpenChange,
  product,
  categories,
  defaultCategoryId,
  canViewCosts,
  onSaved,
}) {
  const { toast } = useToast();
  const [form, setForm] = useState(() => buildForm(product, categories, defaultCategoryId));
  const [saving, setSaving] = useState(false);
  const [invalidField, setInvalidField] = useState(null);

  useEffect(() => {
    if (open) {
      setForm(buildForm(product, categories, defaultCategoryId));
      setInvalidField(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, product, defaultCategoryId]);

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)),
    [categories]
  );

  const setField = (patch) => setForm((f) => ({ ...f, ...patch }));

  const setVariant = (idx, patch) =>
    setForm((f) => ({
      ...f,
      variants: f.variants.map((v, i) => (i === idx ? { ...v, ...patch } : v)),
    }));

  const addVariant = () =>
    setForm((f) => ({ ...f, variants: [...f.variants, { key: '', label: '', price: '', cost: '' }] }));

  const removeVariant = (idx) =>
    setForm((f) => ({ ...f, variants: f.variants.filter((_, i) => i !== idx) }));

  const setModifier = (idx, patch) =>
    setForm((f) => ({
      ...f,
      modifiers: f.modifiers.map((m, i) => (i === idx ? { ...m, ...patch } : m)),
    }));

  const addModifier = () => setForm((f) => ({ ...f, modifiers: [...f.modifiers, { key: '', label: '' }] }));

  const removeModifier = (idx) => setForm((f) => ({ ...f, modifiers: f.modifiers.filter((_, i) => i !== idx) }));

  const handleCategoryChange = (categoryId) => {
    const cat = categories.find((c) => c.id === categoryId);
    setField({
      category_id: categoryId,
      // Solo empuja la estación por defecto de la categoría si el producto
      // es nuevo — al editar uno ya existente, su estación propia no se
      // pisa por cambiar de categoría sin querer.
      station: product ? form.station : cat?.station_default ?? form.station,
    });
  };

  const fail = (field, description) => {
    setInvalidField(field);
    toast({ variant: 'destructive', title: 'Revisa este dato', description });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) return fail('name', 'El nombre del producto es obligatorio.');
    if (!form.category_id) return fail('category_id', 'Elige una categoría.');

    const usedVariants = form.hasVariants
      ? form.variants.filter((v) => v.label.trim())
      : [];
    if (form.hasVariants && usedVariants.length === 0) {
      return fail('variants', 'Agrega al menos un tamaño con su precio, o desactiva "Tiene tamaños".');
    }

    const payload = {
      id: product?.id,
      name,
      category_id: form.category_id,
      station: form.station,
      active: form.active,
      seasonal: form.seasonal,
      modifiers: form.modifiers
        .filter((m) => m.label.trim())
        .map((m) => ({ key: m.key.trim() || slugify(m.label), label: m.label.trim() })),
    };

    if (form.hasVariants) {
      const keysSeen = new Set();
      for (const v of usedVariants) {
        const price = Number(v.price);
        if (!v.price || Number.isNaN(price) || price <= 0) {
          return fail('variants', `El tamaño "${v.label.trim()}" necesita un precio mayor a cero.`);
        }
        let key = v.key.trim() || slugify(v.label);
        if (keysSeen.has(key)) key = `${key}_${keysSeen.size + 1}`;
        keysSeen.add(key);
      }
      const keysAssigned = new Set();
      payload.variants = usedVariants.map((v) => {
        let key = v.key.trim() || slugify(v.label);
        if (keysAssigned.has(key)) key = `${key}_${keysAssigned.size + 1}`;
        keysAssigned.add(key);
        const variant = { key, label: v.label.trim(), price: pesosToCents(v.price) };
        if (canViewCosts) variant.cost = v.cost === '' ? null : pesosToCents(v.cost);
        return variant;
      });
      // El servidor ignora price/cost del producto cuando hay variantes
      // (contrato §4) y `price` ya no es obligatorio en ese caso (fixed
      // 2026-09-28: el servidor solo exige un precio de producto válido
      // cuando NO hay variantes) — así que no hace falta duplicar el precio
      // del primer tamaño aquí para "no dejar el campo requerido vacío".
    } else {
      const price = Number(form.price);
      if (!form.price || Number.isNaN(price) || price <= 0) {
        return fail('price', 'El precio debe ser mayor a cero.');
      }
      payload.variants = [];
      payload.price = pesosToCents(form.price);
      if (canViewCosts) {
        // Fixed 2026-09-28: dejar el campo Costo en blanco significa "aún
        // no capturado" (null), no "cuesta $0" — mandar 0 volvía imposible
        // distinguir ambos casos y mostraba una utilidad del 100% falsa.
        payload.cost = form.cost === '' ? null : pesosToCents(form.cost);
      }
      // Si no puede ver costos, `cost` simplemente no viaja: el servidor
      // conserva el guardado (lección `applyCost` de StockFlow).
    }

    setInvalidField(null);
    setSaving(true);
    try {
      await callFn('catalog', 'upsertProduct', payload);
      toast({ title: product ? 'Producto actualizado' : 'Producto creado', description: name });
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'No se pudo guardar el producto',
        description: err instanceof ApiError ? err.message : 'Error de red, intenta de nuevo.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{product ? 'Editar producto' : 'Nuevo producto'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="prod-name">Nombre</Label>
            <Input
              id="prod-name"
              autoFocus
              value={form.name}
              onChange={(e) => setField({ name: e.target.value })}
              aria-invalid={invalidField === 'name'}
              className={invalidField === 'name' ? 'border-destructive' : ''}
              placeholder="p. ej. Tabla de quesos"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Categoría</Label>
              <Select value={form.category_id} onValueChange={handleCategoryChange}>
                <SelectTrigger
                  aria-invalid={invalidField === 'category_id'}
                  className={invalidField === 'category_id' ? 'border-destructive' : ''}
                >
                  <SelectValue placeholder="Elige una categoría" />
                </SelectTrigger>
                <SelectContent>
                  {sortedCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Estación</Label>
              <Select value={form.station} onValueChange={(v) => setField({ station: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATION_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
            <div>
              <Label htmlFor="prod-variants-toggle">Tiene tamaños (variantes)</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Cada tamaño tiene su propio precio{canViewCosts ? ' y costo' : ''}.
              </p>
            </div>
            <Switch
              id="prod-variants-toggle"
              checked={form.hasVariants}
              onCheckedChange={(checked) => setField({ hasVariants: checked })}
            />
          </div>

          {!form.hasVariants ? (
            <div className={`grid gap-3 ${canViewCosts ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <div className="space-y-1.5">
                <Label htmlFor="prod-price">Precio (MXN)</Label>
                <Input
                  id="prod-price"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={form.price}
                  onChange={(e) => setField({ price: e.target.value })}
                  aria-invalid={invalidField === 'price'}
                  className={invalidField === 'price' ? 'border-destructive' : ''}
                  placeholder="0.00"
                />
              </div>
              {canViewCosts && (
                <div className="space-y-1.5">
                  <Label htmlFor="prod-cost">Costo (MXN)</Label>
                  <Input
                    id="prod-cost"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={form.cost}
                    onChange={(e) => setField({ cost: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Tamaños</Label>
              {form.variants.map((v, idx) => (
                <div key={idx} className="flex items-end gap-2">
                  <div className="flex-1 space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Etiqueta</Label>
                    <Input
                      value={v.label}
                      onChange={(e) => setVariant(idx, { label: e.target.value })}
                      placeholder="p. ej. Chico (2-4 personas)"
                      aria-invalid={invalidField === 'variants' && !v.label.trim()}
                    />
                  </div>
                  <div className="w-24 space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Precio</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={v.price}
                      onChange={(e) => setVariant(idx, { price: e.target.value })}
                    />
                  </div>
                  {canViewCosts && (
                    <div className="w-24 space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Costo</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        value={v.cost}
                        onChange={(e) => setVariant(idx, { cost: e.target.value })}
                      />
                    </div>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeVariant(idx)}
                    disabled={form.variants.length === 1}
                    aria-label="Quitar tamaño"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addVariant}>
                <Plus className="w-4 h-4" /> Agregar tamaño
              </Button>
            </div>
          )}

          <div className="space-y-2">
            <Label>Modificadores (sin costo)</Label>
            {form.modifiers.map((m, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Input
                  value={m.label}
                  onChange={(e) => setModifier(idx, { label: e.target.value })}
                  placeholder="p. ej. En leche"
                  className="flex-1"
                />
                <Button type="button" variant="ghost" size="icon" onClick={() => removeModifier(idx)} aria-label="Quitar modificador">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addModifier}>
              <Plus className="w-4 h-4" /> Agregar modificador
            </Button>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Switch id="prod-active" checked={form.active} onCheckedChange={(v) => setField({ active: v })} />
              <Label htmlFor="prod-active">Activo</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="prod-seasonal" checked={form.seasonal} onCheckedChange={(v) => setField({ seasonal: v })} />
              <Label htmlFor="prod-seasonal">De temporada</Label>
            </div>
          </div>

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

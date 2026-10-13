// Alta/edición de un extra con precio (`catalog.upsertExtra`). Un extra se
// ofrece en todos los productos o solo en los que se elijan aquí. No tiene
// costo: solo un precio que se suma al renglón.
import React, { useEffect, useMemo, useState } from 'react';
import { callFn, ApiError } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { centsToPesos } from '@/lib/money';
import { pesosInputToCents } from '@/lib/extras';
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
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2 } from 'lucide-react';

function buildForm(extra, nextSort) {
  return {
    name: extra?.name ?? '',
    price: extra && extra.price != null ? String(centsToPesos(extra.price)) : '',
    applies_to: extra?.applies_to === 'products' ? 'products' : 'all',
    product_ids: Array.isArray(extra?.product_ids) ? extra.product_ids : [],
    active: extra?.active ?? true,
    sort: extra ? extra.sort ?? 0 : nextSort ?? 0,
  };
}

/**
 * @param {{ open: boolean, onOpenChange: (v:boolean)=>void, extra?: object,
 *   products: object[], categories: object[], nextSort?: number,
 *   onSaved: () => void }} props
 */
export default function ExtraFormDialog({ open, onOpenChange, extra, products, categories, nextSort, onSaved }) {
  const { toast } = useToast();
  const [form, setForm] = useState(() => buildForm(extra, nextSort));
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [invalidField, setInvalidField] = useState(null);

  useEffect(() => {
    if (open) {
      setForm(buildForm(extra, nextSort));
      setSearch('');
      setInvalidField(null);
    }
  }, [open, extra, nextSort]);

  const categoryName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  const visibleProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...products]
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [products, search]);

  const toggleProduct = (id) => {
    setForm((f) => ({
      ...f,
      product_ids: f.product_ids.includes(id) ? f.product_ids.filter((x) => x !== id) : [...f.product_ids, id],
    }));
  };

  const fail = (field, description) => {
    setInvalidField(field);
    toast({ variant: 'destructive', title: 'Revisa este dato', description });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) return fail('name', 'El nombre del extra es obligatorio.');
    if (name.length > 60) return fail('name', 'El nombre no puede pasar de 60 caracteres.');
    const price = pesosInputToCents(form.price);
    if (price === null) return fail('price', 'Escribe un precio válido, por ejemplo 15 o 15.50.');
    if (form.applies_to === 'products' && form.product_ids.length === 0) {
      return fail('products', 'Elige al menos un producto o usa "Todos los productos".');
    }
    setInvalidField(null);
    setSaving(true);
    try {
      await callFn('catalog', 'upsertExtra', {
        id: extra?.id,
        name,
        price,
        applies_to: form.applies_to,
        product_ids: form.applies_to === 'products' ? form.product_ids : [],
        active: form.active,
        sort: form.sort,
      });
      toast({ title: extra ? 'Extra actualizado' : 'Extra creado', description: name });
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'No se pudo guardar el extra',
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
          <DialogTitle>{extra ? 'Editar extra' : 'Nuevo extra'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="extra-name">Nombre</Label>
              <Input
                id="extra-name"
                autoFocus
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                aria-invalid={invalidField === 'name'}
                className={invalidField === 'name' ? 'border-destructive' : ''}
                placeholder="p. ej. Shot extra"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="extra-price">Precio (MXN)</Label>
              <Input
                id="extra-price"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                aria-invalid={invalidField === 'price'}
                className={invalidField === 'price' ? 'border-destructive' : ''}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>¿En qué productos se ofrece?</Label>
            <RadioGroup
              value={form.applies_to}
              onValueChange={(v) => setForm((f) => ({ ...f, applies_to: v }))}
              className="gap-2"
            >
              <label
                htmlFor="extra-scope-all"
                className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 cursor-pointer has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
              >
                <RadioGroupItem value="all" id="extra-scope-all" />
                <span className="text-sm">Todos los productos</span>
              </label>
              <label
                htmlFor="extra-scope-products"
                className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 cursor-pointer has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
              >
                <RadioGroupItem value="products" id="extra-scope-products" />
                <span className="text-sm">Solo algunos productos</span>
              </label>
            </RadioGroup>
          </div>

          {form.applies_to === 'products' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="extra-search">Productos</Label>
                <span className="text-xs text-muted-foreground">{form.product_ids.length} elegido(s)</span>
              </div>
              <Input
                id="extra-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar producto…"
              />
              <div
                className={`max-h-56 overflow-y-auto rounded-lg border divide-y divide-border/60 ${
                  invalidField === 'products' ? 'border-destructive' : 'border-border'
                }`}
              >
                {visibleProducts.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">Sin resultados.</p>
                )}
                {visibleProducts.map((p) => (
                  <label
                    key={p.id}
                    htmlFor={`extra-prod-${p.id}`}
                    className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer"
                  >
                    <Checkbox
                      id={`extra-prod-${p.id}`}
                      checked={form.product_ids.includes(p.id)}
                      onCheckedChange={() => toggleProduct(p.id)}
                    />
                    <span className="text-sm flex-1 min-w-0 truncate">{p.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{categoryName.get(p.category_id) ?? ''}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
            <div>
              <Label htmlFor="extra-active">Activo</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Un extra inactivo no se ofrece al tomar la comanda.
              </p>
            </div>
            <Switch
              id="extra-active"
              checked={form.active}
              onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))}
            />
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

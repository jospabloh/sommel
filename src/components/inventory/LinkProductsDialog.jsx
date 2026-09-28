// Ligar productos del menú a un insumo. Cuánto descuenta una unidad vendida
// (en la unidad del insumo); con variantes, cada una lleva su cantidad y 0
// significa que esa variante no descuenta. La venta la descuenta el servidor
// al cobrar; aquí solo se configura. Productos vía callFn('catalog','listProducts').
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { callFn } from '@/lib/api';
import { toast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatQty, parseNumber, unitShort } from './helpers';

function ProductLinkRow({ product, item, itemNameById, onChanged }) {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const linkedHere = product.track_inventory && product.inventory_item_id === item.id;
  const linkedElsewhere = product.track_inventory && product.inventory_item_id && product.inventory_item_id !== item.id;
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState('');
  const [variantQtys, setVariantQtys] = useState({});
  const [busy, setBusy] = useState(false);

  const startEdit = () => {
    setQty(linkedHere && typeof product.inventory_qty === 'number' ? String(product.inventory_qty) : '');
    const initial = {};
    variants.forEach((v) => {
      initial[v.key] = linkedHere && typeof v.inventory_qty === 'number' ? String(v.inventory_qty) : '';
    });
    setVariantQtys(initial);
    setOpen(true);
  };

  const buildPayload = () => {
    if (variants.length === 0) {
      const n = parseNumber(qty);
      if (!Number.isFinite(n) || n <= 0) return null;
      return { inventory_qty: n };
    }
    const map = {};
    let any = false;
    for (const v of variants) {
      const raw = variantQtys[v.key];
      if (raw === undefined || String(raw).trim() === '') continue;
      const n = parseNumber(raw);
      if (!Number.isFinite(n) || n < 0) return null;
      map[v.key] = n;
      if (n > 0) any = true;
    }
    return any ? { variant_qtys: map } : null;
  };
  const payload = open ? buildPayload() : null;

  const save = async (body, okTitle) => {
    setBusy(true);
    try {
      const res = await callFn('inventory', 'linkProduct', { product_id: product.id, ...body });
      toast({ title: okTitle, description: product.name });
      onChanged(res.product);
      setOpen(false);
    } catch (err) {
      toast({ title: 'No se pudo guardar', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const unit = unitShort(item.unit);

  return (
    <li className="py-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium break-words">{product.name}</div>
          <div className="text-xs text-muted-foreground">
            {linkedHere
              ? variants.length === 0
                ? `Descuenta ${formatQty(product.inventory_qty)} ${unit} por venta`
                : 'Ligado a este insumo'
              : linkedElsewhere
                ? `Ligado a ${itemNameById[product.inventory_item_id] || 'otro insumo'}`
                : 'Sin ligar'}
          </div>
        </div>
        {!open && (
          <Button size="sm" variant={linkedHere ? 'outline' : 'default'} className="h-9 shrink-0" onClick={startEdit}>
            {linkedHere ? 'Cambiar' : linkedElsewhere ? 'Mover aquí' : 'Ligar'}
          </Button>
        )}
      </div>

      {open && (
        <div className="rounded-lg border border-border bg-background p-3 space-y-3">
          {variants.length === 0 ? (
            <div className="space-y-1.5">
              <Label htmlFor={`q-${product.id}`}>Descuenta por unidad vendida ({unit})</Label>
              <Input id={`q-${product.id}`} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} className="h-11 text-base" autoFocus />
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Cuánto descuenta cada variante ({unit}). Usa 0 si no descuenta.</p>
              {variants.map((v) => (
                <div key={v.key} className="flex items-center gap-3">
                  <Label htmlFor={`q-${product.id}-${v.key}`} className="flex-1 min-w-0 break-words">{v.label || v.key}</Label>
                  <Input
                    id={`q-${product.id}-${v.key}`}
                    inputMode="decimal"
                    className="h-10 w-24 text-base"
                    value={variantQtys[v.key] ?? ''}
                    onChange={(e) => setVariantQtys((prev) => ({ ...prev, [v.key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2 justify-end">
            {linkedHere && (
              <Button size="sm" variant="ghost" className="h-9 mr-auto" disabled={busy}
                onClick={() => save({ inventory_item_id: null }, 'Producto desligado')}>
                Quitar liga
              </Button>
            )}
            <Button size="sm" variant="ghost" className="h-9" onClick={() => setOpen(false)}>Volver</Button>
            <Button size="sm" className="h-9" disabled={!payload || busy}
              onClick={() => save({ inventory_item_id: item.id, ...payload }, 'Producto ligado')}>
              {busy ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

export default function LinkProductsDialog({ item, items, onOpenChange, onLinksChanged }) {
  const open = !!item;
  const [products, setProducts] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setError(null);
    setProducts(null);
    try {
      const res = await callFn('catalog', 'listProducts', {});
      setProducts(res.products || []);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    if (item) {
      setSearch('');
      load();
    }
  }, [item, load]);

  const itemNameById = useMemo(() => Object.fromEntries((items || []).map((i) => [i.id, i.name])), [items]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = (products || []).filter((p) => !term || String(p.name || '').toLowerCase().includes(term));
    // Linked to this item first, then the rest by name.
    return list.sort((a, b) => {
      const la = a.inventory_item_id === item?.id && a.track_inventory ? 0 : 1;
      const lb = b.inventory_item_id === item?.id && b.track_inventory ? 0 : 1;
      if (la !== lb) return la - lb;
      return String(a.name || '').localeCompare(String(b.name || ''), 'es');
    });
  }, [products, search, item]);

  const handleChanged = (updated) => {
    setProducts((prev) => (prev || []).map((p) => (p.id === updated.id ? updated : p)));
    onLinksChanged(updated);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Productos de {item?.name}</DialogTitle>
          <DialogDescription>Los productos ligados descuentan este insumo al cobrar.</DialogDescription>
        </DialogHeader>
        <Input placeholder="Buscar producto" value={search} onChange={(e) => setSearch(e.target.value)} className="h-10" />
        {error ? (
          <div className="space-y-2">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={load}>Reintentar</Button>
          </div>
        ) : products === null ? (
          <div className="flex justify-center py-8">
            <div className="w-7 h-7 border-4 border-border border-t-primary rounded-full animate-spin" />
          </div>
        ) : visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay productos que coincidan.</p>
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((p) => (
              <ProductLinkRow key={p.id} product={p} item={item} itemNameById={itemNameById} onChanged={handleChanged} />
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

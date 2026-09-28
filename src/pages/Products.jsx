import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { formatCurrency } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Wine, Loader2 } from 'lucide-react';

// NOTE (plan-tecnico.md §2, Fase 0): Product dropped `type`/`stock`/
// `low_stock_threshold` (stock now lives on InventoryItem, D13) and renamed
// `category` to `category_id`. This is the minimum rename to keep the page
// compiling against the new schema — the real menu/catalog UI (categories
// picker, cost field, variants, track_inventory) is Entrega 1 work, not
// Fase 0.
const empty = { name: '', category_id: '', price: '' };

export default function Products() {
  const { user } = useAuth();
  const tenantId = user?.data?.tenant_id;
  const [products, setProducts] = useState(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const prods = await base44.entities.Product.filter({ tenant_id: tenantId }, 'category_id', 200);
    setProducts(prods);
  };
  useEffect(() => { if (tenantId) load(); }, [tenantId]);

  const openNew = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (p) => {
    setEditing(p);
    setForm({ name: p.data.name, category_id: p.data.category_id || '', price: String(p.data.price ?? '') });
    setOpen(true);
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      tenant_id: tenantId,
      name: form.name.trim(),
      category_id: form.category_id.trim() || null,
      price: Number(form.price) || 0
    };
    try {
      if (editing) await base44.entities.Product.update(editing.id, payload);
      else await base44.entities.Product.create(payload);
      setOpen(false);
      await load();
    } catch (err) { alert(err.message || 'Error al guardar'); }
    setSaving(false);
  };

  const remove = async (p) => {
    if (!confirm(`¿Eliminar "${p.data.name}"?`)) return;
    await base44.entities.Product.delete(p.id);
    await load();
  };

  if (!tenantId) return <div className="p-10 text-muted-foreground">Sin bar asignado.</div>;

  return (
    <div className="p-6 lg:p-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl font-semibold">Productos</h1>
          <p className="text-muted-foreground mt-1">Catálogo e inventario de tu bar</p>
        </div>
        <Button onClick={openNew} className="h-11"><Plus className="w-4 h-4 mr-1" /> Nuevo</Button>
      </div>

      {!products ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" /></div>
      ) : products.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">Aún no hay productos. Agrega tu primer vino.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {products.map(p => (
            <div key={p.id} className="bg-card border border-border rounded-2xl p-5">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"><Wine className="w-5 h-5 text-primary" /></div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{p.data.name}</div>
                  <div className="text-xs text-muted-foreground">{p.data.category_id || 'Sin categoría'}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-primary">{formatCurrency(p.data.price)}</div>
                </div>
              </div>
              <div className="flex items-center justify-end mt-4 pt-4 border-t border-border">
                <div className="flex gap-1">
                  <button onClick={() => openEdit(p)} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => remove(p)} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center text-destructive"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'Editar producto' : 'Nuevo producto'}</DialogTitle></DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Categoría</Label>
                <Input value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} placeholder="Tinto, Blanco..." />
              </div>
              <div className="space-y-2">
                <Label>Precio</Label>
                <Input type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
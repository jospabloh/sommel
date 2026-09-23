import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Wine, Loader2, Unlock } from 'lucide-react';
import { cn } from '@/lib/utils';

const empty = { name: '', seats: '4' };

export default function Tables() {
  const { user } = useAuth();
  const tenantId = user?.data?.tenant_id;
  const [tables, setTables] = useState(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const tbls = await base44.entities.BarTable.filter({ tenant_id: tenantId }, 'name', 100);
    setTables(tbls);
  };
  useEffect(() => { if (tenantId) load(); }, [tenantId]);

  const openNew = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (t) => { setEditing(t); setForm({ name: t.data.name, seats: String(t.data.seats ?? '4') }); setOpen(true); };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    const payload = { tenant_id: tenantId, name: form.name.trim(), seats: Number(form.seats) || 4 };
    try {
      if (editing) await base44.entities.BarTable.update(editing.id, payload);
      else await base44.entities.BarTable.create(payload);
      setOpen(false); await load();
    } catch (err) { alert(err.message || 'Error'); }
    setSaving(false);
  };

  const remove = async (t) => {
    if (!confirm(`¿Eliminar "${t.data.name}"?`)) return;
    await base44.entities.BarTable.delete(t.id);
    await load();
  };

  const free = async (t) => {
    await base44.entities.BarTable.update(t.id, { status: 'available' });
    await load();
  };

  if (!tenantId) return <div className="p-10 text-muted-foreground">Sin bar asignado.</div>;

  return (
    <div className="p-6 lg:p-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl font-semibold">Mesas</h1>
          <p className="text-muted-foreground mt-1">Áreas de barra y mesa de tu local</p>
        </div>
        <Button onClick={openNew} className="h-11"><Plus className="w-4 h-4 mr-1" /> Nueva</Button>
      </div>

      {!tables ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" /></div>
      ) : tables.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">Aún no hay mesas.</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {tables.map(t => (
            <div key={t.id} className={cn('rounded-2xl border-2 p-5 flex flex-col', t.data.status === 'occupied' ? 'border-accent bg-accent/10' : 'border-border bg-card')}>
              <div className="flex items-center justify-between mb-3">
                <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', t.data.status === 'occupied' ? 'bg-accent/20' : 'bg-muted')}>
                  <Wine className={cn('w-5 h-5', t.data.status === 'occupied' ? 'text-accent' : 'text-muted-foreground')} />
                </div>
                <span className={cn('text-xs px-2 py-0.5 rounded-full', t.data.status === 'occupied' ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground')}>
                  {t.data.status === 'occupied' ? 'Ocupada' : 'Libre'}
                </span>
              </div>
              <div className="font-medium">{t.data.name}</div>
              <div className="text-xs text-muted-foreground mb-3">{t.data.seats} lugares</div>
              <div className="flex gap-1 mt-auto">
                {t.data.status === 'occupied' && (
                  <button onClick={() => free(t)} title="Liberar" className="flex-1 h-8 rounded-lg hover:bg-muted flex items-center justify-center"><Unlock className="w-4 h-4" /></button>
                )}
                <button onClick={() => openEdit(t)} className="flex-1 h-8 rounded-lg hover:bg-muted flex items-center justify-center"><Pencil className="w-4 h-4" /></button>
                <button onClick={() => remove(t)} className="flex-1 h-8 rounded-lg hover:bg-muted flex items-center justify-center text-destructive"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'Editar mesa' : 'Nueva mesa'}</DialogTitle></DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Mesa 3, Barra 1..." required autoFocus />
            </div>
            <div className="space-y-2">
              <Label>Lugares</Label>
              <Input type="number" min="1" value={form.seats} onChange={(e) => setForm({ ...form, seats: e.target.value })} />
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
import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { Building2, Wine, Crown, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { formatMXN } from '@/lib/money';
import { isPlatformUser } from '@/lib/rbac';

// Platform panel. Reads and writes go through settings.platformListBars /
// settings.platformSetLicense (platform-only on the server); this page writes
// no entity directly. Every license change is audited in WineBar.license_audit.

const STATUS_LABELS = {
  trial: 'Prueba',
  active: 'Activa',
  view_only: 'Solo lectura',
  suspended: 'Suspendida',
};

const toDateInput = (iso) => (iso ? String(iso).slice(0, 10) : '');
// A date input yields a day; the license stores the end of that day (UTC).
const fromDateInput = (d) => (d ? `${d}T23:59:59.000Z` : null);
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('es-MX', { dateStyle: 'medium' }) : 'Sin fecha');

function errMessage(err, fallback) {
  return err?.response?.data?.error || err?.message || fallback;
}

export default function SuperAdmin() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [bars, setBars] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ status: 'trial', plan: '', trialEnd: '', periodEnd: '', note: '' });
  const [saving, setSaving] = useState(false);

  const isPlatform = isPlatformUser(user);

  const load = async () => {
    setLoadError('');
    try {
      const res = await base44.functions.invoke('settings', { action: 'platformListBars' });
      setBars(res.data?.bars || []);
    } catch (err) {
      setBars([]);
      setLoadError(errMessage(err, 'No se pudo cargar la lista de bares'));
    }
  };
  useEffect(() => { if (isPlatform) load(); }, [isPlatform]);

  const openEdit = (b) => {
    setEditing(b);
    setForm({
      status: b.billing_status || 'trial',
      plan: b.plan || '',
      trialEnd: toDateInput(b.trial_end_at),
      periodEnd: toDateInput(b.current_period_end),
      note: '',
    });
  };

  const save = async () => {
    if (!editing) return;
    // Send only what differs, so the audit trail records real changes.
    const patch = {};
    if (form.status !== (editing.billing_status || 'trial')) patch.billing_status = form.status;
    if ((form.plan.trim() || null) !== (editing.plan || null)) patch.plan = form.plan.trim() || null;
    if (form.trialEnd !== toDateInput(editing.trial_end_at)) patch.trial_end_at = fromDateInput(form.trialEnd);
    if (form.periodEnd !== toDateInput(editing.current_period_end)) patch.current_period_end = fromDateInput(form.periodEnd);
    if (Object.keys(patch).length === 0) {
      toast({ title: 'Sin cambios', description: 'No modificaste ningún dato de la licencia.' });
      return;
    }
    setSaving(true);
    try {
      const res = await base44.functions.invoke('settings', {
        action: 'platformSetLicense',
        bar_id: editing.id,
        patch,
        note: form.note.trim(),
      });
      const next = res.data?.bar;
      if (next) {
        // The set response carries no counts; keep the ones already on screen.
        setBars((prev) => prev.map((b) => (b.id === editing.id
          ? { ...b, ...next, products: b.products, orders: b.orders, revenue_cents: b.revenue_cents }
          : b)));
      }
      toast({ title: 'Licencia actualizada', description: editing.name });
      setEditing(null);
    } catch (err) {
      toast({ title: 'No se guardó', description: errMessage(err, 'Error al guardar la licencia'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (!isPlatform) {
    return <div className="p-10 text-muted-foreground">Acceso restringido al administrador de la plataforma.</div>;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-10 max-w-6xl">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-11 h-11 rounded-xl bg-primary/15 flex items-center justify-center"><Building2 className="w-6 h-6 text-primary" /></div>
        <div>
          <h1 className="font-display text-3xl font-semibold">Plataforma</h1>
          <p className="text-muted-foreground mt-0.5">Gestión de wine bars suscritos</p>
        </div>
      </div>

      {!bars ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" /></div>
      ) : loadError ? (
        <div className="text-center py-20">
          <p className="text-destructive mb-3">{loadError}</p>
          <Button variant="outline" onClick={load}>Reintentar</Button>
        </div>
      ) : bars.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">Aún no hay wine bars registrados.</div>
      ) : (
        <div className="space-y-4">
          {bars.map((b) => {
            const status = b.billing_status || 'trial';
            const last = b.last_license_change;
            return (
              <div key={b.id} className="bg-card border border-border rounded-2xl p-5">
                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"><Wine className="w-5 h-5 text-primary" /></div>
                    <div className="min-w-0">
                      <div className="font-semibold truncate flex items-center gap-2">{b.name} <Crown className="w-3.5 h-3.5 text-primary" /></div>
                      <div className="text-xs text-muted-foreground truncate">{b.address || 'Sin dirección'}</div>
                      {b.archived_at && <div className="text-xs text-muted-foreground">Archivado el {fmtDate(b.archived_at)}</div>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                    <div><div className="text-muted-foreground text-xs">Productos</div><div className="font-medium">{b.products}</div></div>
                    <div><div className="text-muted-foreground text-xs">Cuentas</div><div className="font-medium">{b.orders}</div></div>
                    <div><div className="text-muted-foreground text-xs">Ingresos</div><div className="font-medium text-primary">{formatMXN(b.revenue_cents)}</div></div>
                  </div>
                  <div className="flex items-center gap-3 lg:w-64 justify-between lg:justify-end">
                    <div className="text-sm">
                      <div className="font-medium">{STATUS_LABELS[status] || status}</div>
                      <div className="text-xs text-muted-foreground">{b.plan || 'Sin plan'}</div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => openEdit(b)}>
                      <Pencil className="w-3.5 h-3.5 mr-1.5" />Licencia
                    </Button>
                  </div>
                </div>
                {last && (
                  <p className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground">
                    Último cambio: {fmtDate(last.at)} por {last.by}{last.note ? `. ${last.note}` : ''}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o && !saving) setEditing(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Licencia de {editing?.name}</DialogTitle>
            <DialogDescription>
              Ajuste manual. Mission Control sigue siendo el dueño principal de la licencia; cada cambio queda registrado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lic-plan">Plan</Label>
              <Input id="lic-plan" maxLength={60} value={form.plan} onChange={(e) => setForm((f) => ({ ...f, plan: e.target.value }))} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="lic-trial">Fin de la prueba</Label>
                <Input id="lic-trial" type="date" value={form.trialEnd} onChange={(e) => setForm((f) => ({ ...f, trialEnd: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lic-period">Pagado hasta</Label>
                <Input id="lic-period" type="date" value={form.periodEnd} onChange={(e) => setForm((f) => ({ ...f, periodEnd: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lic-note">Nota (opcional)</Label>
              <Input id="lic-note" maxLength={300} placeholder="Motivo del cambio" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

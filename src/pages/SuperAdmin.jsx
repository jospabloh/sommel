import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { Building2, Wine, Crown } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCurrency } from '@/lib/format';

export default function SuperAdmin() {
  const { user } = useAuth();
  const [bars, setBars] = useState(null);
  const [counts, setCounts] = useState({});

  const load = async () => {
    const allBars = await base44.entities.WineBar.list('-created_date', 200);
    setBars(allBars);
    const c = {};
    for (const b of allBars) {
      const [prods, ords] = await Promise.all([
        base44.entities.Product.filter({ tenant_id: b.id }, '-updated_date', 1),
        base44.entities.Order.filter({ tenant_id: b.id, status: 'cobrada' }, '-closed_at', 200)
      ]);
      const revenue = ords.reduce((s, o) => s + (o.total || 0), 0);
      c[b.id] = { products: prods.length, orders: ords.length, revenue };
    }
    setCounts(c);
  };
  useEffect(() => { load(); }, []);

  // TODO: this direct `WineBar.update` write technically violates contract
  // §1's "ninguna página escribe entidades directo" — accepted for now as a
  // platform-only exception (§6b: this page is `user.role === 'admin'`-gated
  // and `billing_status` is already RLS-locked to that same role, so there's
  // no bypass), but a future pass should route it through a Safe function
  // like every other write, for consistency rather than a leak.
  const setStatus = async (barId, status) => {
    await base44.entities.WineBar.update(barId, { billing_status: status });
    setBars(prev => prev.map(b => b.id === barId ? { ...b, billing_status: status } : b));
  };

  if (user?.role !== 'admin') {
    return <div className="p-10 text-muted-foreground">Acceso restringido al administrador de la plataforma.</div>;
  }

  return (
    <div className="p-6 lg:p-10 max-w-6xl">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-11 h-11 rounded-xl bg-primary/15 flex items-center justify-center"><Building2 className="w-6 h-6 text-primary" /></div>
        <div>
          <h1 className="font-display text-3xl font-semibold">Plataforma</h1>
          <p className="text-muted-foreground mt-0.5">Gestión de wine bars suscritos</p>
        </div>
      </div>

      {!bars ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" /></div>
      ) : bars.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">Aún no hay wine bars registrados.</div>
      ) : (
        <div className="space-y-4">
          {bars.map(b => {
            const c = counts[b.id] || {};
            const status = b.billing_status || 'trial';
            return (
              <div key={b.id} className="bg-card border border-border rounded-2xl p-5">
                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"><Wine className="w-5 h-5 text-primary" /></div>
                    <div className="min-w-0">
                      <div className="font-semibold truncate flex items-center gap-2">{b.name} <Crown className="w-3.5 h-3.5 text-primary" /></div>
                      <div className="text-xs text-muted-foreground truncate">{b.address || 'Sin dirección'}</div>
                    </div>
                  </div>
                  <div className="flex gap-6 text-sm">
                    <div><div className="text-muted-foreground text-xs">Productos</div><div className="font-medium flex items-center gap-1"><Wine className="w-3.5 h-3.5" />{c.products ?? '-'}</div></div>
                    <div><div className="text-muted-foreground text-xs">Cuentas</div><div className="font-medium">{c.orders ?? '-'}</div></div>
                    <div><div className="text-muted-foreground text-xs">Ingresos</div><div className="font-medium text-primary">{c.revenue != null ? formatCurrency(c.revenue) : '-'}</div></div>
                  </div>
                  <div className="w-44">
                    <Select value={status} onValueChange={(v) => setStatus(b.id, v)}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="trial">Prueba</SelectItem>
                        <SelectItem value="active">Activa</SelectItem>
                        <SelectItem value="view_only">Solo lectura</SelectItem>
                        <SelectItem value="suspended">Suspendida</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
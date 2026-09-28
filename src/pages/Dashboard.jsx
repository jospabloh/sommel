import React, { useEffect, useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { formatCurrency } from '@/lib/format';
import Onboarding from '@/pages/Onboarding';
import { ShoppingCart, Wine, LayoutGrid, TrendingUp, ArrowRight } from 'lucide-react';

export default function Dashboard() {
  const { user } = useAuth();
  const [products, setProducts] = useState(null);
  const [tables, setTables] = useState(null);
  const [orders, setOrders] = useState(null);

  const isPlatformAdmin = user?.role === 'admin';
  const tenantId = user?.data?.tenant_id;

  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      const [prods, tbls, ords] = await Promise.all([
        base44.entities.Product.filter({ tenant_id: tenantId }, '-updated_date', 100),
        base44.entities.BarTable.filter({ tenant_id: tenantId }, '-updated_date', 50),
        base44.entities.Order.filter({ tenant_id: tenantId, status: 'cobrada' }, '-closed_at', 50)
      ]);
      setProducts(prods); setTables(tbls); setOrders(ords);
    })();
  }, [tenantId]);

  if (isPlatformAdmin && !tenantId) return <Navigate to="/super-admin" replace />;
  if (!tenantId) return <Onboarding />;

  const loading = !products || !tables || !orders;
  const today = new Date().toISOString().slice(0, 10);
  // NOTE: totals are now stored in centavos MXN (plan-tecnico.md §5); this
  // Fase 0 pass only renames fields to compile — formatCurrency still shows
  // the raw number and needs a centavos-aware display pass before Entrega 1.
  const salesToday = orders.filter(o => (o.data.closed_at || '').slice(0, 10) === today);
  const totalToday = salesToday.reduce((s, o) => s + (o.data.total || 0), 0);
  const occupied = tables.filter(t => t.data.status === 'occupied');

  // Stock-bajo alert removed here: Product no longer carries stock directly
  // (inventory moved to InventoryItem, D13/§2) — a real low-stock card belongs
  // to the inventory feature, not this Fase 0 compile-fix.
  const cards = [
    { label: 'Ventas de hoy', value: formatCurrency(totalToday), sub: `${salesToday.length} cuentas`, icon: TrendingUp, tone: 'text-primary' },
    { label: 'Productos', value: products.length, sub: 'en catálogo', icon: Wine, tone: 'text-foreground' },
    { label: 'Mesas ocupadas', value: `${occupied.length}/${tables.length}`, sub: 'en este momento', icon: LayoutGrid, tone: occupied.length ? 'text-accent' : 'text-muted-foreground' }
  ];

  return (
    <div className="p-6 lg:p-10 max-w-6xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-semibold">Resumen</h1>
        <p className="text-muted-foreground mt-1">Vista general de tu wine bar</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {cards.map((c) => {
              const Icon = c.icon;
              return (
                <div key={c.label} className="bg-card border border-border rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-muted-foreground">{c.label}</span>
                    <Icon className={`w-5 h-5 ${c.tone}`} />
                  </div>
                  <div className="text-2xl font-semibold">{c.value}</div>
                  <div className="text-xs text-muted-foreground mt-1">{c.sub}</div>
                </div>
              );
            })}
          </div>

          <Link to="/pos" className="inline-flex items-center gap-2 bg-primary text-primary-foreground rounded-xl px-6 py-3.5 font-medium hover:opacity-90 transition-opacity">
            <ShoppingCart className="w-5 h-5" />
            Abrir POS
            <ArrowRight className="w-4 h-4" />
          </Link>
        </>
      )}
    </div>
  );
}
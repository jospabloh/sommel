// Reportes (Entrega 2, contrato §6 pantalla 5). Todo viene de
// callFn('reports', 'summary'); la página solo presenta. Los porcentajes de
// comparación son de lectura, el dinero siempre lo calcula el servidor.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { callFn } from '@/lib/api';
import { formatMXN } from '@/lib/money';
import { usePermission } from '@/lib/usePermission';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Section from '@/components/reports/Section';
import SummaryCards from '@/components/reports/SummaryCards';
import BarTable from '@/components/reports/BarTable';
import HourBars from '@/components/reports/HourBars';
import CostsCard from '@/components/reports/CostsCard';
import { Cancellations, Courtesies, Waste, CashDifferences } from '@/components/reports/Incidents';
import { barToday, daysBetween, fmtRange, thisWeekRange } from '@/components/reports/periods';

const MAX_DAYS = 92;
const PERIODS = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'semana', label: 'Esta semana' },
  { id: 'rango', label: 'Rango' },
];

const money = (r) => formatMXN(r.sales);
const qtyFmt = (r) => Number(r.qty).toLocaleString('es-MX');

export default function Reportes() {
  const { can } = usePermission();
  const canView = can('Reportes:ver');

  const [period, setPeriod] = useState('hoy');
  const [custom, setCustom] = useState(() => {
    const today = barToday();
    return { from: today, to: today };
  });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const requestSeq = useRef(0);

  const rangeFor = useCallback(() => {
    if (period === 'hoy') {
      const today = barToday();
      return { from: today, to: today };
    }
    if (period === 'semana') return thisWeekRange();
    return custom;
  }, [period, custom]);

  const customProblem = (() => {
    if (period !== 'rango') return null;
    if (!custom.from || !custom.to) return 'Elige la fecha inicial y la final.';
    if (custom.from > custom.to) return 'La fecha final no puede ser anterior a la inicial.';
    if (daysBetween(custom.from, custom.to) > MAX_DAYS) return `El rango máximo es de ${MAX_DAYS} días.`;
    return null;
  })();

  const load = useCallback(async () => {
    const range = rangeFor();
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      const res = await callFn('reports', 'summary', range);
      if (seq === requestSeq.current) setData(res);
    } catch (err) {
      if (seq === requestSeq.current) {
        setData(null);
        setError(err.message || 'No se pudo cargar el reporte');
      }
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [rangeFor]);

  // Hoy y Esta semana cargan al elegirlos; Rango espera al botón "Ver".
  useEffect(() => {
    if (canView && period !== 'rango') load();
  }, [canView, period, load]);

  if (!canView) {
    return <div className="p-6 lg:p-10 text-muted-foreground">No tienes permiso para ver los reportes.</div>;
  }

  const setDate = (field) => (e) => setCustom((c) => ({ ...c, [field]: e.target.value }));
  const showCosts = data && data.costs;

  const productColumns = [
    { key: 'name', label: 'Producto', render: (r) => <span className="font-medium break-all">{r.name}</span> },
    { key: 'qty', label: 'Cant.', align: 'right', render: qtyFmt },
    { key: 'sales', label: 'Ventas', align: 'right', render: money },
  ];
  if (showCosts) {
    productColumns.push({
      key: 'profit',
      label: 'Utilidad',
      align: 'right',
      render: (r) => (r.uncosted ? `${formatMXN(r.profit || 0)} *` : formatMXN(r.profit || 0)),
    });
  }

  return (
    <div className="p-4 sm:p-6 lg:p-10 max-w-5xl">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-11 h-11 rounded-xl bg-primary/15 flex items-center justify-center">
          <BarChart3 className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold">Reportes</h1>
          <p className="text-muted-foreground mt-0.5">Ventas, productos y caja por periodo.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2 mb-2">
        <div className="flex gap-2 flex-wrap" role="group" aria-label="Periodo">
          {PERIODS.map((p) => (
            <Button
              key={p.id}
              type="button"
              size="sm"
              className="h-10"
              variant={period === p.id ? 'default' : 'outline'}
              aria-pressed={period === p.id}
              onClick={() => setPeriod(p.id)}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      {period === 'rango' ? (
        <form
          className="flex flex-wrap items-end gap-3 mb-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!customProblem) load();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="rep-from">Desde</Label>
            <Input id="rep-from" type="date" value={custom.from} max={barToday()} onChange={setDate('from')} className="h-10" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rep-to">Hasta</Label>
            <Input id="rep-to" type="date" value={custom.to} max={barToday()} onChange={setDate('to')} className="h-10" />
          </div>
          <Button type="submit" className="h-10" disabled={!!customProblem || loading}>
            Ver reporte
          </Button>
        </form>
      ) : null}
      {customProblem ? <p className="text-sm text-destructive mb-2">{customProblem}</p> : null}

      {data ? (
        <p className="text-sm text-muted-foreground mb-4">
          {fmtRange(data.range)}
          <span> · comparado con {fmtRange(data.previous_range)}</span>
        </p>
      ) : (
        <div className="mb-4" />
      )}

      {error ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center space-y-3">
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" onClick={load}>Reintentar</Button>
        </div>
      ) : !data ? (
        loading ? (
          <div className="flex justify-center py-10">
            <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" />
          </div>
        ) : period === 'rango' ? (
          <p className="text-sm text-muted-foreground">Elige las fechas y pulsa "Ver reporte".</p>
        ) : null
      ) : (
        <div className={`space-y-5 transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
          <SummaryCards totals={data.totals} previous={data.previous_totals} />

          {showCosts ? <CostsCard costs={data.costs} /> : null}

          <Section title="Ventas por hora" hint="Hora en que se cobró cada cuenta.">
            <HourBars hours={data.by_hour} />
          </Section>

          <div className="grid gap-5 lg:grid-cols-2">
            <Section title="Por producto">
              <BarTable rows={data.by_product} columns={productColumns} barKey="sales" rowKey={(r) => `${r.product_id}-${r.name}`} />
              {showCosts && data.by_product.some((r) => r.uncosted) ? (
                <p className="text-xs text-muted-foreground mt-2">* Incluye renglones sin costo capturado, que no entran en la utilidad.</p>
              ) : null}
            </Section>
            <Section title="Más vendidos" hint="Los 10 con más piezas.">
              <BarTable
                rows={data.top_products}
                barKey="qty"
                rowKey={(r) => `${r.product_id}-${r.name}`}
                columns={[
                  { key: 'name', label: 'Producto', render: (r) => <span className="font-medium break-words">{r.name}</span> },
                  { key: 'qty', label: 'Cant.', align: 'right', render: qtyFmt },
                  { key: 'sales', label: 'Ventas', align: 'right', render: money },
                ]}
              />
            </Section>
            <Section title="Por categoría">
              <BarTable
                rows={data.by_category}
                barKey="sales"
                rowKey={(r) => r.category_id || 'none'}
                columns={[
                  { key: 'name', label: 'Categoría', render: (r) => <span className="font-medium">{r.name}</span> },
                  { key: 'qty', label: 'Cant.', align: 'right', render: qtyFmt },
                  { key: 'sales', label: 'Ventas', align: 'right', render: money },
                ]}
              />
            </Section>
            <Section title="Por persona" hint="Quien abrió la cuenta.">
              <BarTable
                rows={data.by_person}
                barKey="sales"
                rowKey={(r) => r.email || 'none'}
                columns={[
                  { key: 'name', label: 'Persona', render: (r) => <span className="font-medium break-words">{r.name}</span> },
                  { key: 'orders', label: 'Cuentas', align: 'right' },
                  { key: 'sales', label: 'Ventas', align: 'right', render: money },
                ]}
              />
            </Section>
            <Section title="Por forma de pago">
              <BarTable
                rows={data.by_method}
                barKey="amount"
                rowKey={(r) => r.method || 'none'}
                columns={[
                  { key: 'label', label: 'Forma', render: (r) => <span className="font-medium">{r.label}</span> },
                  { key: 'count', label: 'Pagos', align: 'right' },
                  { key: 'amount', label: 'Monto', align: 'right', render: (r) => formatMXN(r.amount) },
                ]}
              />
            </Section>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Cancellations data={data.cancellations} />
            <Courtesies rows={data.courtesies} />
            <Waste data={data.waste} showCost={!!showCosts} />
            {data.cash_differences ? <CashDifferences rows={data.cash_differences} /> : null}
          </div>
        </div>
      )}
    </div>
  );
}

// Foto congelada del corte (Shift.summary). Solo se pinta con Turno:ver_corte;
// el servidor no manda estas cifras a quien no lo tiene.
import React from 'react';
import { formatMXN } from '@/lib/money';
import { cn } from '@/lib/utils';

function Row({ label, value, strong, tone }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 py-1', strong && 'font-semibold')}>
      <span className={cn('text-sm', !strong && 'text-muted-foreground')}>{label}</span>
      <span className={cn('tabular-nums text-sm', tone === 'bad' && 'text-destructive')}>{value}</span>
    </div>
  );
}

function Block({ title, children }) {
  return (
    <div className="space-y-0.5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">{title}</h3>
      {children}
    </div>
  );
}

export function differenceText(d) {
  if (d === 0) return 'Sin diferencia';
  return d > 0 ? 'Sobrante' : 'Faltante';
}

export default function CorteSummary({ summary, comment }) {
  if (!summary) return null;
  const s = summary;
  return (
    <div className="space-y-5">
      <Block title="Ventas">
        {s.sales_by_method.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin ventas en el turno.</p>
        ) : (
          s.sales_by_method.map((m) => (
            <Row key={m.key} label={`${m.label} (${m.count})`} value={formatMXN(m.amount)} />
          ))
        )}
        <Row label="Total vendido" value={formatMXN(s.sales_total)} strong />
        <Row label="Cuentas cobradas" value={s.orders_paid} />
        <Row label="Ticket promedio" value={formatMXN(s.avg_ticket)} />
        <Row label="Propinas" value={formatMXN(s.tips)} />
        <Row label={`Descuentos (${s.discounts.count})`} value={formatMXN(s.discounts.amount)} />
        <Row label={`Cortesías (${s.courtesies.count})`} value={formatMXN(s.courtesies.amount)} />
        <Row label="Renglones cancelados" value={s.cancelled_items} />
      </Block>

      <Block title="Efectivo">
        <Row label="Fondo inicial" value={formatMXN(s.opening_float)} />
        <Row label="Ventas en efectivo" value={formatMXN(s.cash_sales)} />
        {s.cash_outs.map((o, i) => (
          <Row key={i} label={`Salida: ${o.reason}`} value={`-${formatMXN(o.amount)}`} />
        ))}
        <Row label="Esperado en caja" value={formatMXN(s.expected_cash)} />
        <Row label="Contado" value={formatMXN(s.counted_cash)} />
        <Row
          label={differenceText(s.difference)}
          value={formatMXN(s.difference)}
          strong
          tone={s.difference !== 0 ? 'bad' : undefined}
        />
      </Block>

      {comment ? (
        <Block title="Comentario">
          <p className="text-sm whitespace-pre-wrap">{comment}</p>
        </Block>
      ) : null}
    </div>
  );
}

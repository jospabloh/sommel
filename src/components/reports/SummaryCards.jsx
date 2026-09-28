// Headline cards with the comparison against the previous period.
import React from 'react';
import { formatMXN } from '@/lib/money';
import Delta from './Delta';

function Card({ label, value, hint, children }) {
  return (
    <div className="bg-card border border-border rounded-xl p-3 sm:p-4 min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-display text-xl sm:text-2xl font-semibold mt-1 break-words">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground mt-0.5">{hint}</p> : null}
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

export default function SummaryCards({ totals, previous }) {
  const n = (v) => Number(v || 0).toLocaleString('es-MX');
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Card label="Ventas" value={formatMXN(totals.sales)} hint={`Sin propina ${formatMXN(totals.sales_net)}`}>
        <Delta current={totals.sales} previous={previous.sales} />
      </Card>
      <Card label="Cuentas cobradas" value={n(totals.orders)}>
        <Delta current={totals.orders} previous={previous.orders} />
      </Card>
      <Card label="Ticket promedio" value={formatMXN(totals.avg_ticket)}>
        <Delta current={totals.avg_ticket} previous={previous.avg_ticket} />
      </Card>
      <Card label="Productos vendidos" value={n(totals.items_sold)}>
        <Delta current={totals.items_sold} previous={previous.items_sold} />
      </Card>
      <Card label="Propinas" value={formatMXN(totals.tips)}>
        <Delta current={totals.tips} previous={previous.tips} />
      </Card>
      <Card
        label="Descuentos"
        value={formatMXN(totals.discounts)}
        hint={`${n(totals.discounts_count)} ${totals.discounts_count === 1 ? 'cuenta' : 'cuentas'}`}
      >
        <Delta current={totals.discounts} previous={previous.discounts} goodWhen="down" />
      </Card>
      <Card
        label="Cortesías"
        value={formatMXN(totals.courtesies)}
        hint={`${n(totals.courtesies_count)} ${totals.courtesies_count === 1 ? 'cuenta' : 'cuentas'}`}
      >
        <Delta current={totals.courtesies} previous={previous.courtesies} goodWhen="down" />
      </Card>
    </div>
  );
}

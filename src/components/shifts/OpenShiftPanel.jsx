// Turno abierto: ventas por forma de pago, salidas de efectivo y cierre.
// El efectivo esperado solo aparece con Turno:ver_corte (el servidor no lo
// manda si falta).
import React from 'react';
import { Banknote, LogOut, Minus } from 'lucide-react';
import { formatMXN } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { fmtDateTime, fmtTime } from './helpers';

export default function OpenShiftPanel({ data, canCorte, onCashOut, onClose }) {
  const { shift, cash_outs: cashOuts, totals_by_method: totals, sales_total: salesTotal } = data;
  return (
    <div className="space-y-5">
      <div className="bg-card border border-border rounded-xl p-4 sm:p-5 space-y-1">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-primary" aria-hidden="true" />
          <h2 className="font-display text-lg font-semibold">Turno abierto</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Desde {fmtDateTime(shift.opened_at)} · abrió {shift.opened_by}
        </p>
        <p className="text-sm text-muted-foreground">Fondo de caja: {formatMXN(shift.opening_float)}</p>
      </div>

      <div className="bg-card border border-border rounded-xl p-4 sm:p-5 space-y-3">
        <h2 className="font-display text-lg font-semibold">Ventas del turno</h2>
        {totals.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay cobros en este turno.</p>
        ) : (
          <ul className="divide-y divide-border">
            {totals.map((t) => (
              <li key={t.key} className="flex items-baseline justify-between gap-3 py-2">
                <span className="text-sm">{t.label} <span className="text-muted-foreground">({t.count})</span></span>
                <span className="tabular-nums font-medium">
                  {t.amount == null ? <span className="text-muted-foreground font-normal">Se revisa en el corte</span> : formatMXN(t.amount)}
                </span>
              </li>
            ))}
            {salesTotal != null ? (
              <li className="flex items-baseline justify-between gap-3 py-2 font-semibold">
                <span className="text-sm">Total vendido</span>
                <span className="tabular-nums">{formatMXN(salesTotal)}</span>
              </li>
            ) : null}
          </ul>
        )}
        {canCorte && shift.expected_cash != null ? (
          <div className="flex items-baseline justify-between gap-3 rounded-lg bg-muted px-3 py-2">
            <span className="text-sm text-muted-foreground">Efectivo esperado en caja</span>
            <span className="tabular-nums font-semibold">{formatMXN(shift.expected_cash)}</span>
          </div>
        ) : null}
      </div>

      <div className="bg-card border border-border rounded-xl p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <h2 className="font-display text-lg font-semibold">Salidas de efectivo</h2>
          <Button type="button" variant="outline" className="h-10" onClick={onCashOut}>
            <Banknote className="w-4 h-4 mr-2" /> Registrar salida
          </Button>
        </div>
        {cashOuts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin salidas en este turno.</p>
        ) : (
          <ul className="divide-y divide-border">
            {cashOuts.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-2">
                <Minus className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{m.reason}</p>
                  <p className="text-xs text-muted-foreground">{fmtTime(m.created_date)} · {m.created_by}</p>
                </div>
                <span className="tabular-nums text-sm font-medium">{formatMXN(Math.abs(m.amount))}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Button type="button" className="w-full h-12 text-base" onClick={onClose}>
        <LogOut className="w-4 h-4 mr-2" /> Cerrar turno
      </Button>
    </div>
  );
}

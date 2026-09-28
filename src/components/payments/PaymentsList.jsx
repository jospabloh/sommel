// Pagos de la cuenta (payments.summary). Los anulados quedan a la vista,
// tachados, con su motivo. "Anular" solo aparece con `Cobro:anular_pago`.
import React from 'react';
import { cn } from '@/lib/utils';
import { formatMXN } from '@/lib/money';

export default function PaymentsList({ payments, canVoid, onVoid }) {
  if (!payments?.length) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">Pagos</h3>
      <ul className="space-y-1.5">
        {payments.map((p) => (
          <li
            key={p.id}
            className={cn(
              'rounded-lg border border-border px-3 py-2 flex items-center justify-between gap-3',
              p.voided_at && 'bg-muted/40 text-muted-foreground'
            )}
          >
            <div className="min-w-0">
              <div className={cn('text-sm font-medium', p.voided_at && 'line-through')}>
                {p.method_label || p.method}
                {p.split_label ? ` · ${p.split_label}` : ''}
              </div>
              {p.voided_at && p.void_reason && (
                <div className="text-xs">Anulado: {p.void_reason}</div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={cn('text-sm font-semibold', p.voided_at && 'line-through')}>{formatMXN(p.amount)}</span>
              {canVoid && !p.voided_at && (
                <button
                  type="button"
                  onClick={() => onVoid(p)}
                  className="h-8 px-2.5 rounded-md border border-destructive/50 text-destructive text-xs font-medium active:scale-95"
                >
                  Anular
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

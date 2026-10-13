// Propina de ESTE pago, cuando la cuenta se divide (José, 2026-10-13): cada
// quien deja la suya. Sin propina, 10/15/20 % de su parte, u otro monto. El
// servidor recalcula el monto final (payments.addPayment, `tip`); aqui solo
// es la vista previa para quien cobra.
import React from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { formatMXN, pesosToCents } from '@/lib/money';
import { QUICK_TIP_PCTS } from './TipDialog';

/** `tip` = { kind: 'none' | 'pct' | 'amount', pct?, amountStr? } -> centavos over `portion`. */
export function tipCentsOf(tip, portion) {
  if (tip?.kind === 'pct') return Math.round((portion * tip.pct) / 100);
  if (tip?.kind === 'amount') return pesosToCents(Number(tip.amountStr) || 0);
  return 0;
}

/** Body for addPayment, or undefined for no tip. */
export function tipPayload(tip) {
  if (tip?.kind === 'pct') return { pct: tip.pct };
  if (tip?.kind === 'amount') return { amount: pesosToCents(Number(tip.amountStr) || 0) };
  return undefined;
}

export default function PaymentTip({ value, onChange, portion, disabled }) {
  const chip = (active) =>
    cn(
      'h-12 rounded-lg border text-sm font-medium active:scale-95 disabled:opacity-50',
      active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card'
    );
  return (
    <div className="space-y-1.5">
      <div className="text-sm font-medium">Propina de este pago</div>
      <div className="grid grid-cols-5 gap-1.5">
        <button type="button" disabled={disabled} className={chip(value.kind === 'none')} onClick={() => onChange({ kind: 'none' })}>
          Sin
        </button>
        {QUICK_TIP_PCTS.map((pct) => (
          <button
            key={pct}
            type="button"
            disabled={disabled}
            className={chip(value.kind === 'pct' && value.pct === pct)}
            onClick={() => onChange({ kind: 'pct', pct })}
          >
            <span className="block leading-tight">{pct}%</span>
            {portion > 0 && <span className="block text-[11px] leading-tight opacity-80">{formatMXN(Math.round((portion * pct) / 100))}</span>}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          className={chip(value.kind === 'amount')}
          onClick={() => onChange({ kind: 'amount', amountStr: value.amountStr ?? '' })}
        >
          Otra
        </button>
      </div>
      {value.kind === 'amount' && (
        <Input
          aria-label="Propina en pesos"
          inputMode="decimal"
          placeholder="Monto en pesos"
          value={value.amountStr ?? ''}
          onChange={(e) => onChange({ kind: 'amount', amountStr: e.target.value.replace(/[^0-9.]/g, '') })}
          className="h-11"
        />
      )}
    </div>
  );
}

// Dividir la cuenta (payments.splitPreview): completa, partes iguales o por
// platillos. Presentacional: los montos vienen del servidor.
import React from 'react';
import { Minus, Plus, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMXN } from '@/lib/money';
import { lineSubtitle } from '@/components/orders/helpers';

const MODES = [
  { id: 'full', label: 'Completa' },
  { id: 'equal', label: 'Iguales' },
  { id: 'items', label: 'Platillos' },
];

export default function SplitSection({
  mode,
  onModeChange,
  disabled,
  partsTotal,
  partsDone,
  onPartsChange,
  equalAmounts,
  items,
  selectedIds,
  paidItemIds,
  onToggleItem,
  itemsAmount,
}) {
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            disabled={disabled}
            onClick={() => onModeChange(m.id)}
            className={cn(
              'flex-1 h-10 rounded-lg text-sm font-medium disabled:opacity-50',
              mode === m.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'equal' && (
        <div className="rounded-xl border border-border p-3 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm">Dividir entre</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={partsDone > 0 || partsTotal <= 2}
                onClick={() => onPartsChange(partsTotal - 1)}
                className="w-9 h-9 rounded-full border border-border flex items-center justify-center disabled:opacity-40 active:scale-95"
                aria-label="Menos personas"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="w-8 text-center font-semibold">{partsTotal}</span>
              <button
                type="button"
                disabled={partsDone > 0 || partsTotal >= 20}
                onClick={() => onPartsChange(partsTotal + 1)}
                className="w-9 h-9 rounded-full border border-border flex items-center justify-center disabled:opacity-40 active:scale-95"
                aria-label="Más personas"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
          {equalAmounts.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {equalAmounts.map((a, i) => (
                <span
                  key={i}
                  className={cn(
                    'text-xs px-2 py-1 rounded-full border',
                    i === 0 ? 'border-primary/50 bg-primary/10 text-primary font-medium' : 'border-border text-muted-foreground'
                  )}
                >
                  {formatMXN(a)}
                </span>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Pago {partsDone + 1} de {partsTotal}. El resto se reparte entre quienes faltan.
          </p>
        </div>
      )}

      {mode === 'items' && (
        <div className="rounded-xl border border-border p-3 space-y-2">
          <p className="text-xs text-muted-foreground">Elige lo que paga esta persona. El descuento y la propina se reparten en proporción.</p>
          <ul className="space-y-1.5">
            {items.map((item) => {
              const paid = paidItemIds.has(item.id);
              const checked = selectedIds.has(item.id);
              const sub = lineSubtitle(item);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={paid}
                    onClick={() => onToggleItem(item.id)}
                    className={cn(
                      'w-full text-left rounded-lg border px-3 py-2 flex items-center gap-3 disabled:opacity-50',
                      checked ? 'border-primary/60 bg-primary/10' : 'border-border'
                    )}
                  >
                    <span
                      className={cn(
                        'w-5 h-5 rounded border flex items-center justify-center shrink-0',
                        checked ? 'bg-primary border-primary text-primary-foreground' : 'border-input'
                      )}
                    >
                      {checked && <Check className="w-3.5 h-3.5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm truncate">
                        {item.qty} x {item.name}
                      </span>
                      {sub && <span className="block text-xs text-muted-foreground truncate">{sub}</span>}
                    </span>
                    <span className="text-sm shrink-0">{paid ? 'Pagado' : formatMXN(Math.round(item.unit_price * item.qty))}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {selectedIds.size > 0 && itemsAmount !== null && (
            <div className="flex items-center justify-between text-sm pt-1">
              <span className="text-muted-foreground">Le toca pagar</span>
              <span className="font-semibold">{formatMXN(itemsAmount)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Un renglón de la comanda (contrato §5, pantalla 7): lo no enviado se ve
// claramente distinto de lo enviado — borde punteado + "Sin enviar" vs.
// badge de estado sólido. +/- rápidos y quitar solo aplican a lo no enviado
// (orders.updateItem/removeItem exigen status 'nuevo' del lado servidor,
// contrato §4); cancelar aplica a lo enviado (orders.cancelItem).
import React from 'react';
import { Minus, Plus, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMXN } from '@/lib/money';
import { ITEM_STATUS_LABELS, isLineUnsent, isLineCancellable, itemStatusClasses, lineSubtitle } from './helpers';

export default function OrderLineItem({ item, canEdit, canCancel, onQtyChange, onRemove, onCancel, busy }) {
  const unsent = isLineUnsent(item.status);
  const cancellable = isLineCancellable(item.status);
  const subtitle = lineSubtitle(item);

  return (
    <div
      className={cn(
        'rounded-xl border p-3 flex flex-col gap-2',
        unsent ? 'border-dashed border-primary/50 bg-primary/5' : 'border-border bg-card'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium text-sm leading-tight">{item.name}</div>
          {subtitle && <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>}
          {item.notes && <div className="text-xs text-muted-foreground italic mt-0.5">"{item.notes}"</div>}
        </div>
        <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full border shrink-0', itemStatusClasses(item.status))}>
          {ITEM_STATUS_LABELS[item.status] || item.status}
        </span>
      </div>

      {item.status === 'cancelado' && item.cancel_reason && (
        <div className="text-xs text-destructive">Motivo: {item.cancel_reason}</div>
      )}

      <div className="flex items-center justify-between gap-2">
        {unsent && canEdit ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy || item.qty <= 1}
              onClick={() => onQtyChange(item, item.qty - 1)}
              className="w-8 h-8 rounded-full border border-border flex items-center justify-center disabled:opacity-40 active:scale-95"
              aria-label="Menos"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="w-6 text-center text-sm font-medium">{item.qty}</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => onQtyChange(item, item.qty + 1)}
              className="w-8 h-8 rounded-full border border-border flex items-center justify-center active:scale-95"
              aria-label="Más"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">× {item.qty}</span>
        )}

        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">{formatMXN(item.unit_price * item.qty)}</span>
          {unsent && canEdit && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onRemove(item)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              aria-label="Quitar renglón"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          {cancellable && canCancel && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onCancel(item)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              aria-label="Cancelar renglón"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

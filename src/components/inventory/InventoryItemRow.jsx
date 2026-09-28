// One insumo in the list. Low stock is shown with the destructive token, not
// color alone: a "Bajo" / "Agotado" label rides along.
import React from 'react';
import { PackagePlus, Trash2, ClipboardCheck, History, Link2, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMXN } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { formatQty, unitShort } from './helpers';

export default function InventoryItemRow({
  item, isLow, showCost, linkedCount,
  canEdit, canWaste,
  onEntry, onWaste, onCount, onHistory, onLink, onEdit,
}) {
  const depleted = (Number(item.stock) || 0) <= 0;
  return (
    <li
      className={cn(
        'rounded-xl border bg-card p-3 sm:p-4 space-y-3',
        isLow ? 'border-destructive/50' : 'border-border'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium leading-tight break-words">{item.name}</div>
          <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
            <span>Mínimo {formatQty(item.low_threshold)} {unitShort(item.unit)}</span>
            {showCost && typeof item.unit_cost === 'number' && (
              <span>{formatMXN(item.unit_cost)} por {unitShort(item.unit)}</span>
            )}
            {linkedCount > 0 && <span>{linkedCount} {linkedCount === 1 ? 'producto ligado' : 'productos ligados'}</span>}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className={cn('font-display text-2xl font-semibold leading-none', isLow && 'text-destructive')}>
            {formatQty(item.stock)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">{unitShort(item.unit)}</div>
          {isLow && (
            <div className="text-[11px] font-medium text-destructive mt-1">{depleted ? 'Agotado' : 'Bajo'}</div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {canEdit && (
          <Button size="sm" variant="outline" className="h-9" onClick={() => onEntry(item)}>
            <PackagePlus className="w-4 h-4 mr-1.5" /> Entrada
          </Button>
        )}
        {canWaste && (
          <Button size="sm" variant="outline" className="h-9" onClick={() => onWaste(item)}>
            <Trash2 className="w-4 h-4 mr-1.5" /> Merma
          </Button>
        )}
        {canEdit && (
          <Button size="sm" variant="outline" className="h-9" onClick={() => onCount(item)}>
            <ClipboardCheck className="w-4 h-4 mr-1.5" /> Conteo
          </Button>
        )}
        {canEdit && (
          <Button size="sm" variant="ghost" className="h-9" onClick={() => onLink(item)}>
            <Link2 className="w-4 h-4 mr-1.5" /> Productos
          </Button>
        )}
        {canEdit && (
          <Button size="sm" variant="ghost" className="h-9" onClick={() => onEdit(item)} aria-label={`Editar ${item.name}`}>
            <Pencil className="w-4 h-4" />
          </Button>
        )}
        <Button size="sm" variant="ghost" className="h-9" onClick={() => onHistory(item)}>
          <History className="w-4 h-4 mr-1.5" /> Historial
        </Button>
      </div>
    </li>
  );
}

// Tarjeta de un producto en la lista del menú (pantallas 6/13 de la
// propuesta). Costo y utilidad solo se pintan si `canViewCosts` — y el dato
// nunca llegó al navegador si el servidor ya lo redactó (contrato §4, D7).
import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Pencil, Leaf, EyeOff, ChefHat, Beer } from 'lucide-react';
import { formatMXN } from '@/lib/money';
import { priceRange, profitFor, stationLabel } from './menuUtils';

const STATION_ICON = { kitchen: ChefHat, bar: Beer };

function VariantRow({ variant, canViewCosts }) {
  const profit = canViewCosts ? profitFor(variant.price, variant.cost) : null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 text-sm py-1">
      <span className="text-muted-foreground">{variant.label}</span>
      <span className="flex items-center gap-3">
        <span className="font-medium">{formatMXN(variant.price)}</span>
        {canViewCosts && (
          <span className="text-xs text-muted-foreground text-right sm:w-28">
            {profit === null
              ? 'sin costo'
              : `${formatMXN(profit.profit)} · ${profit.marginPct.toFixed(0)}%`}
          </span>
        )}
      </span>
    </div>
  );
}

/**
 * @param {{ product: object, canEdit: boolean, canViewCosts: boolean,
 *   onEdit: () => void, onToggleActive: (active:boolean) => void }} props
 */
export default function ProductCard({ product, canEdit, canViewCosts, onEdit, onToggleActive, toggleDisabled }) {
  const hasVariants = Array.isArray(product.variants) && product.variants.length > 0;
  const { min, max } = priceRange(product);
  const profit = canViewCosts && !hasVariants ? profitFor(product.price, product.cost) : null;
  const StationIcon = STATION_ICON[product.station];

  return (
    <div className={`rounded-xl border border-border bg-card p-4 ${!product.active ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium truncate">{product.name}</span>
            {product.seasonal && (
              <Badge variant="secondary" className="gap-1"><Leaf className="w-3 h-3" /> Temporada</Badge>
            )}
            {!product.active && (
              <Badge variant="outline" className="gap-1"><EyeOff className="w-3 h-3" /> Inactivo</Badge>
            )}
            {StationIcon && (
              <Badge variant="outline" className="gap-1" title={stationLabel(product.station)}>
                <StationIcon className="w-3 h-3" /> {stationLabel(product.station)}
              </Badge>
            )}
          </div>

          {!hasVariants ? (
            <div className="mt-1 flex flex-wrap items-center gap-x-3">
              <span className="font-semibold">{formatMXN(product.price)}</span>
              {canViewCosts && (
                <span className="text-xs text-muted-foreground">
                  {profit === null ? 'costo sin capturar' : `utilidad ${formatMXN(profit.profit)} · ${profit.marginPct.toFixed(0)}%`}
                </span>
              )}
            </div>
          ) : (
            <div className="mt-1">
              <span className="font-semibold">
                {min === max ? formatMXN(min) : `${formatMXN(min)} – ${formatMXN(max)}`}
              </span>
              <div className="mt-1 divide-y divide-border/60">
                {product.variants.map((v) => (
                  <VariantRow key={v.key} variant={v} canViewCosts={canViewCosts} />
                ))}
              </div>
            </div>
          )}

          {Array.isArray(product.modifiers) && product.modifiers.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {product.modifiers.map((m) => (
                <Badge key={m.key} variant="outline" className="font-normal">{m.label}</Badge>
              ))}
            </div>
          )}
        </div>

        {canEdit && (
          <div className="flex flex-col items-end gap-2 shrink-0">
            <Button size="icon" variant="ghost" onClick={onEdit} aria-label={`Editar ${product.name}`}>
              <Pencil className="w-4 h-4" />
            </Button>
            <Switch
              checked={product.active}
              onCheckedChange={onToggleActive}
              disabled={toggleDisabled}
              aria-label={product.active ? 'Desactivar producto' : 'Activar producto'}
            />
          </div>
        )}
      </div>
    </div>
  );
}

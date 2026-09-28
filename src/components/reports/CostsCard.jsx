// Costo y utilidad. Only rendered when the server sent `costs`, which it
// does only for callers with Menú:ver_costos.
import React from 'react';
import { formatMXN } from '@/lib/money';
import Section from './Section';

export default function CostsCard({ costs }) {
  const margin =
    costs.margin_pct === null || costs.margin_pct === undefined
      ? 'Sin datos'
      : `${costs.margin_pct.toLocaleString('es-MX')}%`;

  return (
    <Section
      title="Costo y utilidad"
      hint="Solo cuenta los renglones que tienen costo capturado; un costo vacío no se toma como cero."
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <p className="text-xs text-muted-foreground">Costo</p>
          <p className="font-display text-xl font-semibold">{formatMXN(costs.cost)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Utilidad</p>
          <p className="font-display text-xl font-semibold">{formatMXN(costs.profit)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Margen</p>
          <p className="font-display text-xl font-semibold">{margin}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Renglones sin costo</p>
          <p className="font-display text-xl font-semibold">{Number(costs.uncosted_items || 0).toLocaleString('es-MX')}</p>
        </div>
      </div>
      {costs.uncosted_items > 0 ? (
        <p className="text-sm text-muted-foreground mt-3">
          Hay renglones vendidos sin costo. Captura el costo en el menú para que la utilidad sea completa.
        </p>
      ) : null}
    </Section>
  );
}

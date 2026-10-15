// Mapa de mesas con acomodo real (BarTable.x/y) o, si ninguna mesa tiene
// coordenadas todavía, una cuadrícula simple (contrato §5: "table map ...
// fallback grid"). Las mesas sin coordenadas nunca se encimen en 0,0: si hay
// mesas acomodadas, las demás van en la cuadrícula automática debajo del mapa.
// Las mesas para llevar no viven aquí (no tienen mesa).
import React from 'react';
import TableCard from './TableCard';
import { splitTablesByPlacement } from './tableLayout';

export default function TableMap({ tables, orderByTable, onTapTable, onEditTable, canEdit }) {
  if (tables.length === 0) return null;

  const { placed, unplaced } = splitTablesByPlacement(tables);

  const card = (t, style) => (
    <TableCard
      key={t.id}
      table={t}
      order={orderByTable.get(t.id)}
      onTap={() => onTapTable(t)}
      onEdit={() => onEditTable(t)}
      canEdit={canEdit}
      style={style}
    />
  );

  const grid = (list) => (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">{list.map((t) => card(t))}</div>
  );

  if (placed.length === 0) return grid(unplaced);

  // Coordinates are relative (0-100ish, whatever the person who placed them
  // used) — scale the container instead of assuming a fixed canvas size, so
  // it still reads on a 390px phone.
  const maxX = Math.max(100, ...placed.map((t) => t.x));
  const maxY = Math.max(100, ...placed.map((t) => t.y));
  return (
    <div className="space-y-4">
      <div className="relative w-full" style={{ aspectRatio: `${maxX + 20} / ${maxY + 20}`, minHeight: 320 }}>
        {placed.map((t) =>
          card(t, {
            position: 'absolute',
            left: `${(t.x / (maxX + 20)) * 100}%`,
            top: `${(t.y / (maxY + 20)) * 100}%`,
            width: 132,
          })
        )}
      </div>
      {unplaced.length > 0 && grid(unplaced)}
    </div>
  );
}

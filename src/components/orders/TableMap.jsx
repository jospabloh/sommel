// Mapa de mesas con acomodo real (BarTable.x/y) o, si ninguna mesa tiene
// coordenadas todavía, una cuadrícula simple (contrato §5: "table map ...
// fallback grid"). Las mesas para llevar no viven aquí (no tienen mesa).
import React from 'react';
import TableCard from './TableCard';

export default function TableMap({ tables, orderByTable, onTapTable, onEditTable, canEdit }) {
  const hasCoords = tables.some((t) => typeof t.x === 'number' && typeof t.y === 'number');

  if (tables.length === 0) return null;

  if (hasCoords) {
    // Coordinates are relative (0-100ish, whatever the person who placed them
    // used) — scale the container instead of assuming a fixed canvas size, so
    // it still reads on a 390px phone.
    const maxX = Math.max(100, ...tables.map((t) => t.x ?? 0));
    const maxY = Math.max(100, ...tables.map((t) => t.y ?? 0));
    return (
      <div className="relative w-full" style={{ aspectRatio: `${maxX + 20} / ${maxY + 20}`, minHeight: 320 }}>
        {tables.map((t) => (
          <TableCard
            key={t.id}
            table={t}
            order={orderByTable.get(t.id)}
            onTap={() => onTapTable(t)}
            onEdit={() => onEditTable(t)}
            canEdit={canEdit}
            style={{
              position: 'absolute',
              left: `${((t.x ?? 0) / (maxX + 20)) * 100}%`,
              top: `${((t.y ?? 0) / (maxY + 20)) * 100}%`,
              width: 132,
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {tables.map((t) => (
        <TableCard
          key={t.id}
          table={t}
          order={orderByTable.get(t.id)}
          onTap={() => onTapTable(t)}
          onEdit={() => onEditTable(t)}
          canEdit={canEdit}
        />
      ))}
    </div>
  );
}

// One tile in the table map / fallback grid (Mesas.jsx). Free vs occupied is
// the one thing that has to read instantly on a phone across the room, so it
// leans on background + border, not just a small badge.
import React from 'react';
import { Users, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { tableStatusLabel } from './helpers';

export default function TableCard({ table, order, onTap, onEdit, canEdit, style }) {
  const occupied = table.status === 'occupied';

  return (
    <div
      style={style}
      className={cn(
        'relative rounded-2xl border-2 p-3 flex flex-col justify-between min-h-[92px] text-left transition-colors active:scale-[0.98]',
        occupied
          ? 'border-accent bg-accent/15 text-accent-foreground'
          : 'border-border bg-card hover:border-primary/50'
      )}
    >
      <button type="button" onClick={onTap} className="absolute inset-0 rounded-2xl" aria-label={`Mesa ${table.name}`} />
      <div className="flex items-start justify-between gap-2 pointer-events-none">
        <div className="font-display font-semibold text-base leading-tight truncate">{table.name}</div>
        {canEdit && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="pointer-events-auto shrink-0 w-7 h-7 rounded-full flex items-center justify-center hover:bg-foreground/10"
            aria-label={`Editar mesa ${table.name}`}
          >
            <Pencil className="w-3.5 h-3.5 opacity-60" />
          </button>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 pointer-events-none">
        <div className="flex items-center gap-1 text-xs opacity-70">
          <Users className="w-3.5 h-3.5" />
          {table.seats ?? '-'}
        </div>
        <span
          className={cn(
            'text-[11px] font-medium px-2 py-0.5 rounded-full',
            occupied ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'
          )}
        >
          {tableStatusLabel(table.status)}
        </span>
      </div>
      {occupied && order && (
        <div className="text-[11px] opacity-70 truncate pointer-events-none">
          {order.customer_name || 'En curso'}
        </div>
      )}
    </div>
  );
}

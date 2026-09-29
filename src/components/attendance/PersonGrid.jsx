// Cuadrícula de nombres del equipo con su estado (dentro / fuera).
import React from 'react';
import { KeyRound, LogIn } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fmtTime } from './helpers';

function statusText(p) {
  if (!p.has_pin) return 'Aún sin PIN';
  if (p.inside) return p.forgotten ? `Dentro desde ${fmtTime(p.since)}, revisar salida` : `Dentro desde las ${fmtTime(p.since)}`;
  return 'Fuera';
}

export default function PersonGrid({ people, onPick }) {
  if (people.length === 0) {
    return <p className="text-center text-sm text-muted-foreground py-8">Todavía no hay personas en el equipo.</p>;
  }
  return (
    <ul className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-3 gap-3">
      {people.map((p) => (
        <li key={p.user_id}>
          <button
            type="button"
            onClick={() => onPick(p)}
            className={cn(
              'w-full min-h-[88px] rounded-2xl border p-4 text-left flex items-center gap-3 transition-colors touch-manipulation',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              p.inside ? 'border-primary bg-primary/10' : 'border-border bg-card hover:bg-secondary'
            )}
          >
            <span
              className={cn(
                'w-12 h-12 rounded-full flex items-center justify-center shrink-0 text-lg font-semibold',
                p.inside ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              )}
              aria-hidden="true"
            >
              {p.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-lg font-semibold truncate">{p.name}</span>
              <span className={cn('block text-sm truncate', p.forgotten ? 'text-destructive' : 'text-muted-foreground')}>
                {statusText(p)}
              </span>
            </span>
            {!p.has_pin ? <KeyRound className="w-5 h-5 text-muted-foreground shrink-0" /> : p.inside ? null : <LogIn className="w-5 h-5 text-muted-foreground shrink-0" />}
          </button>
        </li>
      ))}
    </ul>
  );
}

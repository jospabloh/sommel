// Sales by local hour as plain CSS columns (no chart library). 24 columns
// fit at 390 px; labels show every third hour.
import React from 'react';
import { formatMXN } from '@/lib/money';
import { Empty } from './Section';

const pad = (h) => `${String(h).padStart(2, '0')}:00`;

export default function HourBars({ hours }) {
  const max = Math.max(0, ...hours.map((h) => h.sales));
  if (max <= 0) return <Empty />;
  const peak = hours.reduce((best, h) => (h.sales > best.sales ? h : best), hours[0]);

  return (
    <div>
      <p className="text-sm mb-3">
        Hora más fuerte: <span className="font-medium">{pad(peak.hour)}</span>
        <span className="text-muted-foreground">
          {' '}
          ({peak.orders} {peak.orders === 1 ? 'cuenta' : 'cuentas'}, {formatMXN(peak.sales)})
        </span>
      </p>
      <div className="flex items-end gap-[3px] h-32" role="img" aria-label="Ventas por hora del día">
        {hours.map((h) => {
          const pct = Math.round((h.sales / max) * 100);
          return (
            <div
              key={h.hour}
              className="flex-1 min-w-0 flex flex-col justify-end h-full"
              title={`${pad(h.hour)}: ${formatMXN(h.sales)}, ${h.orders} ${h.orders === 1 ? 'cuenta' : 'cuentas'}`}
            >
              <div
                className={`w-full rounded-t-sm ${h.sales > 0 ? 'bg-primary' : 'bg-muted'}`}
                style={{ height: h.sales > 0 ? `${Math.max(pct, 4)}%` : '2px' }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-[3px] mt-1" aria-hidden="true">
        {hours.map((h) => (
          <div key={h.hour} className="flex-1 min-w-0 text-[10px] text-muted-foreground text-center overflow-visible">
            {h.hour % 3 === 0 ? h.hour : ''}
          </div>
        ))}
      </div>
    </div>
  );
}

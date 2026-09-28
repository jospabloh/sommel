// Paints PrintJob.lines ([{ text, align?, bold?, size? }], contract §1). The
// server formats; this only renders. Used for the on-screen preview and for
// the print area, so what you preview is what prints.
import React from 'react';
import { cn } from '@/lib/utils';
import './printing.css';

export default function TicketLines({ lines, className }) {
  const rows = Array.isArray(lines) ? lines : [];
  return (
    <div className={cn('tk-paper', className)}>
      {rows.map((line, i) => (
        <div
          key={i}
          className={cn(
            'tk-line',
            line?.align === 'center' && 'tk-center',
            line?.align === 'right' && 'tk-right',
            line?.bold && 'tk-bold',
            line?.size === 'big' && 'tk-big',
          )}
        >
          {line?.text ? line.text : ' '}
        </div>
      ))}
    </div>
  );
}

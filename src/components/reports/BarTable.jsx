// Table with a simple CSS bar behind the first numeric column.
// `columns`: [{ key, label, render?(row), align?: 'right' }]; the bar is
// drawn from `barKey`, scaled to the largest value in the table.
import React from 'react';
import { Empty } from './Section';

export default function BarTable({ rows, columns, barKey, rowKey, emptyText }) {
  if (!rows || rows.length === 0) return <Empty>{emptyText}</Empty>;
  const max = Math.max(1, ...rows.map((r) => Math.abs(Number(r[barKey]) || 0)));

  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground border-b border-border">
            {columns.map((c) => (
              <th key={c.key} className={`py-2 pr-3 font-medium ${c.align === 'right' ? 'text-right' : ''}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const pct = Math.round((Math.abs(Number(row[barKey]) || 0) / max) * 100);
            return (
              <tr key={rowKey ? rowKey(row) : i} className="border-b border-border/60 last:border-0">
                {columns.map((c, ci) => (
                  <td key={c.key} className={`py-2 pr-3 align-top ${c.align === 'right' ? 'text-right tabular-nums' : ''}`}>
                    {c.render ? c.render(row) : row[c.key]}
                    {ci === 0 ? (
                      <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden" aria-hidden="true">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                    ) : null}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

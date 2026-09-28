// Titled card used by every report block.
import React from 'react';

export default function Section({ title, hint, children }) {
  return (
    <section className="bg-card border border-border rounded-xl p-4 sm:p-5 min-w-0">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      {hint ? <p className="text-sm text-muted-foreground mt-0.5">{hint}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function Empty({ children = 'Sin datos en este periodo.' }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

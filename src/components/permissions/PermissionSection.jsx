import React from 'react';
import PermissionRow from './PermissionRow';

export default function PermissionSection({ section, items, overrides, disabled, onToggle, onReset }) {
  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      <h2 className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground bg-muted/50 border-b border-border">
        {section}
      </h2>
      <ul className="divide-y divide-border">
        {items.map((it) => (
          <PermissionRow
            key={it.key}
            permKey={it.key}
            label={it.label}
            overrides={overrides}
            disabled={disabled}
            onToggle={onToggle}
            onReset={onReset}
          />
        ))}
      </ul>
    </section>
  );
}

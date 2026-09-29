import React from 'react';
import { RotateCcw } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { defaultFor, effectiveFor, isChanged } from './permissionsLogic';

// One permission for the staff role: label, default-vs-changed state, the
// switch (saved on toggle) and a per-key reset that only shows when changed.
export default function PermissionRow({ permKey, label, overrides, disabled, onToggle, onReset }) {
  const allowed = effectiveFor(permKey, overrides);
  const changed = isChanged(permKey, overrides);
  const def = defaultFor(permKey);
  const labelId = `perm-${permKey.replace(/[^A-Za-z0-9]/g, '-')}`;

  return (
    <li className="flex items-center gap-3 px-4 py-3 min-h-[3.5rem]">
      <div className="min-w-0 flex-1">
        <p id={labelId} className="text-sm font-medium leading-snug">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {changed ? (
            <>
              <span className="inline-flex items-center rounded-full bg-primary/15 text-primary px-2 py-0.5 font-medium mr-1.5">Cambiado</span>
              Por defecto: {def ? 'permitido' : 'no permitido'}
            </>
          ) : (
            <>
              <span className="inline-flex items-center rounded-full bg-muted text-muted-foreground px-2 py-0.5 font-medium mr-1.5">Valor por defecto</span>
              {def ? 'Permitido' : 'No permitido'}
            </>
          )}
        </p>
      </div>
      {changed && (
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 shrink-0"
          disabled={disabled}
          onClick={() => onReset(permKey)}
          aria-label={`Restablecer «${label}» al valor por defecto`}
          title="Restablecer al valor por defecto"
        >
          <RotateCcw className="w-4 h-4" />
        </Button>
      )}
      <div className="flex h-11 w-11 shrink-0 items-center justify-center">
        <Switch
          checked={allowed}
          disabled={disabled}
          onCheckedChange={(v) => onToggle(permKey, v)}
          aria-labelledby={labelId}
        />
      </div>
    </li>
  );
}

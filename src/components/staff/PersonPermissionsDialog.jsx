// Staff → permisos de UNA persona (2026-10-06). Lo que se elige aquí gana sobre
// el perfil de su rol (pantalla Permisos). Se guarda todo junto con
// permissions.setPersonOverrides, que REEMPLAZA el mapa de esa persona; el
// servidor vuelve a comprobar cada acción con el mismo orden de precedencia.
import React, { useEffect, useMemo, useState } from 'react';
import { callFn } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { personName } from '@/lib/rbac';
import {
  cleanOverrides,
  cleanPersonOverrides,
  effectiveFor,
  groupSections,
  personChoice,
  withPersonChoice,
} from '@/components/permissions/permissionsLogic';

const CHOICES = [
  { value: 'role', label: 'Como su rol' },
  { value: 'yes', label: 'Sí' },
  { value: 'no', label: 'No' },
];

export default function PersonPermissionsDialog({ member, onClose, onSaved }) {
  const [roleMap, setRoleMap] = useState(null);
  const [personMap, setPersonMap] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const sections = useMemo(() => groupSections(), []);

  useEffect(() => {
    if (!member) return undefined;
    let cancelled = false;
    setRoleMap(null);
    setPersonMap(null);
    setError('');
    Promise.all([
      callFn('permissions', 'getProfile', { role: 'staff' }),
      callFn('permissions', 'getPerson', { user_id: member.id }),
    ])
      .then(([profile, person]) => {
        if (cancelled) return;
        setRoleMap(cleanOverrides(profile.profile?.overrides));
        setPersonMap(cleanPersonOverrides(person.person?.overrides));
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'No se pudieron cargar los permisos');
      });
    return () => {
      cancelled = true;
    };
  }, [member]);

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await callFn('permissions', 'setPersonOverrides', { user_id: member.id, overrides: personMap });
      onSaved();
    } catch (err) {
      setError(err.message || 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  };

  const changed = personMap ? Object.keys(personMap).length : 0;

  return (
    <Dialog open={!!member} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Permisos de {member ? personName(member) : ''}</DialogTitle>
          <DialogDescription>
            Lo que elijas aquí vale solo para esta persona y gana sobre lo que diga Permisos para todo el equipo.
            "Como su rol" sigue lo de Permisos.
          </DialogDescription>
        </DialogHeader>

        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

        {!personMap || !roleMap ? (
          !error && (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" />
            </div>
          )
        ) : (
          <div className="space-y-5">
            {sections.map(({ section, items }) => (
              <div key={section}>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">{section}</h3>
                <ul className="space-y-3">
                  {items.map(({ key, label }) => {
                    const choice = personChoice(key, personMap);
                    const roleSays = effectiveFor(key, roleMap);
                    return (
                      <li key={key} className="space-y-1.5">
                        <p className="text-sm font-medium leading-snug">{label}</p>
                        <div className="flex gap-1.5" role="group" aria-label={label}>
                          {CHOICES.map((c) => (
                            <Button
                              key={c.value}
                              type="button"
                              size="sm"
                              variant={choice === c.value ? 'default' : 'outline'}
                              aria-pressed={choice === c.value}
                              className={cn('h-11 flex-1 px-2', c.value === 'role' && 'flex-[1.6]')}
                              disabled={busy}
                              onClick={() => setPersonMap((m) => withPersonChoice(m, key, c.value))}
                            >
                              {c.value === 'role' ? `${c.label} (${roleSays ? 'sí' : 'no'})` : c.label}
                            </Button>
                          ))}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {changed > 0 && (
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setPersonMap({})}>
              Todo como su rol
            </Button>
          )}
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" disabled={busy || !personMap} onClick={save}>
            {busy ? 'Guardando…' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Pantalla de Permisos (módulo 3): qué puede hacer el equipo (rol staff) en
// este bar. Solo el administrador del bar (o la plataforma). Cada cambio se
// guarda al momento con permissions.upsertProfile, que REEMPLAZA el mapa
// completo; por eso los guardados van en cola y siempre mandan el mapa entero.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ShieldCheck, RotateCcw } from 'lucide-react';
import { callFn } from '@/lib/api';
import { usePermission } from '@/lib/usePermission';
import { useAuth } from '@/lib/AuthContext';
import { BAR_ADMIN } from '@/lib/rbac';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import PermissionSection from '@/components/permissions/PermissionSection';
import {
  cleanOverrides,
  changedCount,
  groupSections,
  withValue,
  withoutKey,
} from '@/components/permissions/permissionsLogic';

export default function Permisos() {
  const { appRole, isPlatform, loading: permLoading } = usePermission();
  const { user } = useAuth();
  // The platform account has no bar of its own: permissions are per bar.
  const allowed = appRole === BAR_ADMIN || (isPlatform && !!user?.tenant_id);
  const { toast } = useToast();
  const [overrides, setOverrides] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const latest = useRef({}); // what the screen shows (optimistic)
  const confirmed = useRef({}); // last map the server acknowledged
  const chain = useRef(Promise.resolve());
  const inFlight = useRef(0);
  const sections = useMemo(() => groupSections(), []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await callFn('permissions', 'getProfile', { role: 'staff' });
      const map = cleanOverrides(res.profile?.overrides);
      latest.current = map;
      confirmed.current = map;
      setOverrides(map);
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los permisos');
    }
  }, []);

  useEffect(() => {
    if (allowed) load();
  }, [allowed, load]);

  const persist = useCallback(
    (next) => {
      latest.current = next;
      setOverrides(next);
      inFlight.current += 1;
      setSaving(true);
      chain.current = chain.current.then(async () => {
        try {
          // Send the newest map, not the one from when this call was queued.
          const res = await callFn('permissions', 'upsertProfile', { role: 'staff', overrides: latest.current });
          confirmed.current = cleanOverrides(res.profile?.overrides ?? latest.current);
        } catch (err) {
          latest.current = confirmed.current;
          setOverrides(confirmed.current);
          toast({
            variant: 'destructive',
            title: 'No se guardó el cambio',
            description: err.message || 'Intenta de nuevo.',
          });
        } finally {
          inFlight.current -= 1;
          if (inFlight.current === 0) setSaving(false);
        }
      });
    },
    [toast]
  );

  const onToggle = useCallback((key, value) => persist(withValue(latest.current, key, value)), [persist]);
  const onReset = useCallback((key) => persist(withoutKey(latest.current, key)), [persist]);
  const onResetAll = useCallback(() => persist({}), [persist]);

  if (permLoading) {
    return (
      <div className="flex justify-center py-10">
        <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!allowed) {
    return <div className="p-6 lg:p-10 text-muted-foreground">Solo el administrador del bar puede cambiar los permisos.</div>;
  }

  const count = overrides ? changedCount(overrides) : 0;

  return (
    <div className="p-4 sm:p-6 lg:p-10 max-w-2xl">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-11 h-11 rounded-xl bg-primary/15 flex items-center justify-center">
          <ShieldCheck className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold">Permisos</h1>
          <p className="text-muted-foreground mt-0.5">Qué puede hacer tu equipo</p>
        </div>
      </div>
      <p className="text-sm text-muted-foreground mb-5">
        Los administradores siempre pueden todo. Aquí eliges qué puede hacer el equipo.
        Los cambios se guardan al momento y aplican la próxima vez que cada persona abra la app.
      </p>

      {error ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center space-y-3">
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" onClick={load}>Reintentar</Button>
        </div>
      ) : !overrides ? (
        <div className="flex justify-center py-10">
          <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-3 min-h-[2.75rem]">
            <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
              {saving ? 'Guardando…' : count === 0 ? 'Todo está en su valor por defecto.' : `${count} ${count === 1 ? 'permiso cambiado' : 'permisos cambiados'}.`}
            </p>
            {count > 0 && (
              <Button variant="outline" size="sm" className="h-11 shrink-0" onClick={onResetAll} disabled={saving}>
                <RotateCcw className="w-4 h-4 mr-2" /> Restablecer todo
              </Button>
            )}
          </div>
          {sections.map((s) => (
            <PermissionSection
              key={s.section}
              section={s.section}
              items={s.items}
              overrides={overrides}
              disabled={false}
              onToggle={onToggle}
              onReset={onReset}
            />
          ))}
        </div>
      )}
    </div>
  );
}

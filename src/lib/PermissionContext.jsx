// Contexto de permisos del bar (contrato §3). Solo exporta el componente
// proveedor — el hook vive en `usePermission.js`, archivo aparte, porque
// exportar un hook y un componente del mismo archivo rompe react-refresh
// (regla ya usada en `src/lib/auth/` del resto del portafolio, y pedida
// explícitamente en la tarea de este agente).
import React, { createContext, useEffect, useMemo, useState, useCallback } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { resolvePermission } from '@/lib/permissionRegistry';

export const PermissionContext = createContext({
  can: () => false,
  loading: true,
  appRole: null,
  isPlatform: false,
});

export function PermissionProvider({ children }) {
  const { user } = useAuth();
  const isPlatform = user?.role === 'admin';
  const appRole = user?.data?.app_role ?? null;
  const tenantId = user?.data?.tenant_id ?? null;
  const [overrides, setOverrides] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadProfile() {
      setLoading(true);
      // Platform admin or bar_admin never need an override lookup — they're
      // always allowed (same short-circuit as the server's hasPermission).
      if (isPlatform || appRole === 'bar_admin' || !tenantId || !appRole) {
        if (!cancelled) {
          setOverrides(null);
          setLoading(false);
        }
        return;
      }
      try {
        const [profile] = await base44.entities.PermissionProfile.filter({
          tenant_id: tenantId,
          role: appRole,
        });
        if (!cancelled) setOverrides(profile?.data?.overrides || null);
      } catch {
        if (!cancelled) setOverrides(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadProfile();
    return () => {
      cancelled = true;
    };
  }, [isPlatform, appRole, tenantId]);

  const can = useCallback(
    (key) => resolvePermission(key, { isPlatform, appRole, overrides }),
    [isPlatform, appRole, overrides]
  );

  const value = useMemo(
    () => ({ can, loading, appRole, isPlatform }),
    [can, loading, appRole, isPlatform]
  );

  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
}

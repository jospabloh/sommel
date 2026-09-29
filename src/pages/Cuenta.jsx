// Cuenta (módulo 7): licencia, sesiones activas y zona de peligro. Abierta a
// cualquier miembro del bar, sin permiso: salir del bar o ver por qué el bar
// está en solo lectura no puede depender de `Ajustes:editar`. Los datos salen
// de settings.billing (solo membresía); el servidor vuelve a comprobar cada
// acción de la cuenta.
import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { UserCircle } from 'lucide-react';
import { callFn } from '@/lib/api';
import { Button } from '@/components/ui/button';
import LicenseCard from '@/components/settings/LicenseCard';
import ActiveSessions from '@/components/settings/ActiveSessions';
import DangerZone from '@/components/settings/DangerZone';

export default function Cuenta() {
  const { user } = useAuth();
  const hasBar = !!user?.tenant_id;
  const [bar, setBar] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await callFn('settings', 'billing');
      setBar(res.bar);
    } catch (err) {
      setError(err.message || 'No se pudo cargar tu cuenta');
    }
  }, []);

  useEffect(() => {
    if (hasBar) load();
  }, [hasBar, load]);

  if (!hasBar) return <div className="p-10 text-muted-foreground">Sin bar asignado.</div>;

  return (
    <div className="p-4 sm:p-6 lg:p-10 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 rounded-xl bg-primary/15 flex items-center justify-center">
          <UserCircle className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold">Cuenta</h1>
          <p className="text-muted-foreground mt-0.5">{bar?.name || 'Tu bar'}</p>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center space-y-3">
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" onClick={load}>Reintentar</Button>
        </div>
      ) : !bar ? (
        <div className="flex justify-center py-10">
          <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-5">
          <LicenseCard bar={bar} />
          <ActiveSessions />
          <DangerZone bar={bar} />
          <p className="text-sm text-muted-foreground">
            ¿Necesitas ayuda con tu licencia o quieres cancelar el servicio?{' '}
            <Link to="/soporte?tipo=baja" className="text-primary underline underline-offset-2">Solicitar baja o soporte</Link>
          </p>
        </div>
      )}
    </div>
  );
}

// Ajustes del bar (Entrega 2, contrato §6): datos del ticket, formas de pago
// y correos del corte. La licencia y la zona de peligro viven en Cuenta. Todo pasa por callFn('settings', ...); esta página
// nunca lee ni escribe WineBar directo.
import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { callFn } from '@/lib/api';
import { usePermission } from '@/lib/usePermission';
import { Button } from '@/components/ui/button';
import TicketForm from '@/components/settings/TicketForm';
import PaymentMethodsCard from '@/components/settings/PaymentMethodsCard';
import CorteEmailsCard from '@/components/settings/CorteEmailsCard';
import TerminalsCard from '@/components/settings/TerminalsCard';
import { useAuth } from '@/lib/AuthContext';
import { isBarAdmin } from '@/lib/rbac';

export default function Ajustes() {
  const { can } = usePermission();
  const { user } = useAuth();
  // Terminals are managed by the bar admin from their own sign-in only.
  const showTerminals = isBarAdmin(user) && !user?.terminal;
  const canEdit = can('Ajustes:editar');
  const [bar, setBar] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await callFn('settings', 'get');
      setBar(res.bar);
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los ajustes');
    }
  }, []);

  useEffect(() => {
    if (canEdit) load();
  }, [canEdit, load]);

  if (!canEdit) {
    return <div className="p-6 lg:p-10 text-muted-foreground">No tienes permiso para ver los ajustes.</div>;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-10 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 rounded-xl bg-primary/15 flex items-center justify-center">
          <Settings className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold">Ajustes</h1>
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
          <TicketForm bar={bar} onSaved={setBar} />
          <PaymentMethodsCard bar={bar} onSaved={setBar} />
          <CorteEmailsCard bar={bar} onSaved={setBar} />
          {showTerminals ? <TerminalsCard /> : null}
          <p className="text-sm text-muted-foreground">
            Licencia, sesiones activas, exportar datos y baja están en{' '}
            <Link to="/cuenta" className="text-primary underline underline-offset-2">Cuenta</Link>.
          </p>
        </div>
      )}
    </div>
  );
}

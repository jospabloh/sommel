// The admin revoked this device: say so, and let it sign out.
import React from 'react';
import { MonitorOff } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';

export default function TerminalRevoked() {
  const { logout } = useAuth();
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-4">
      <div className="max-w-sm text-center space-y-4">
        <MonitorOff className="w-10 h-10 mx-auto text-muted-foreground" />
        <h1 className="font-display text-2xl font-semibold">Este equipo ya no es terminal</h1>
        <p className="text-sm text-muted-foreground">
          El administrador del bar la desactivó. Para volver a usarla, el administrador la activa de nuevo desde Ajustes.
        </p>
        <Button
          onClick={() => {
            logout(false);
            window.location.assign('/login');
          }}
        >
          Cerrar sesión
        </Button>
      </div>
    </div>
  );
}

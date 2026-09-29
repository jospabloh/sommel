// Ajustes: sesiones activas (módulo 20, capa 2). Lista los dispositivos donde
// tu cuenta tiene sesión y deja cerrar cualquiera. Un bar_admin ve además las
// sesiones de las personas de su bar. Todo pasa por la función `session`; esta
// página nunca toca AppSession directo. Cerrar una sesión ajena surte efecto en
// su siguiente latido (hasta 4 min), cuando ese dispositivo recibe 403.
import React, { useCallback, useEffect, useState } from 'react';
import { Laptop, LogOut, Users } from 'lucide-react';
import { callFn } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import { toast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { isBarAdmin as isBarAdminUser } from '@/lib/rbac';

const DEVICE_ID_KEY = 'acacia_device_id'; // same key useSessionManager writes

function readDeviceId() {
  try {
    return localStorage.getItem(DEVICE_ID_KEY) || undefined;
  } catch {
    return undefined;
  }
}

function ago(value) {
  if (!value) return 'sin actividad registrada';
  const mins = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (mins < 2) return 'hace un momento';
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `hace ${hours} h`;
  return `hace ${Math.round(hours / 24)} días`;
}

function SessionRow({ session, showUser, busy, confirming, onAsk, onConfirm, onCancel }) {
  return (
    <li className="flex items-center gap-3 rounded-lg bg-muted px-3 py-2">
      <Laptop className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {showUser ? `${session.user_name || session.user_email || 'Persona'} · ` : ''}
          {session.device_name}
          {session.is_current && (
            <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-normal text-primary">
              Este dispositivo
            </span>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {session.status === 'active' ? 'Activa' : 'En segundo plano'} · {ago(session.last_seen)}
        </p>
      </div>
      {confirming ? (
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" size="sm" variant="destructive" disabled={busy} onClick={onConfirm}>
            Cerrar
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
            No
          </Button>
        </div>
      ) : (
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onAsk} className="shrink-0">
          <LogOut className="mr-1 h-4 w-4" aria-hidden="true" />
          Cerrar sesión
        </Button>
      )}
    </li>
  );
}

export default function ActiveSessions() {
  const { user, logout } = useAuth();
  const isBarAdmin = isBarAdminUser(user) && !!user?.tenant_id;
  const [mine, setMine] = useState(null);
  const [team, setTeam] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const device_id = readDeviceId();
      const res = await callFn('session', 'listSessions', { scope: 'mine', device_id });
      setMine(res.sessions || []);
      if (isBarAdmin) {
        const bar = await callFn('session', 'listSessions', { scope: 'bar', device_id });
        setTeam((bar.sessions || []).filter((s) => !(res.sessions || []).some((m) => m.id === s.id)));
      }
    } catch (err) {
      setError(err.message || 'No se pudieron cargar las sesiones');
    }
  }, [isBarAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  const revoke = async (session) => {
    setBusy(true);
    try {
      await callFn('session', 'revokeSession', { session_id: session.id });
      setConfirmId(null);
      if (session.is_current) {
        logout();
        return;
      }
      toast({ title: 'Sesión cerrada', description: 'Ese dispositivo saldrá en unos minutos.' });
      await load();
    } catch (err) {
      toast({ title: 'No se pudo cerrar la sesión', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const renderList = (rows, showUser) => (
    <ul className="space-y-2">
      {rows.map((s) => (
        <SessionRow
          key={s.id}
          session={s}
          showUser={showUser}
          busy={busy}
          confirming={confirmId === s.id}
          onAsk={() => setConfirmId(s.id)}
          onConfirm={() => revoke(s)}
          onCancel={() => setConfirmId(null)}
        />
      ))}
    </ul>
  );

  return (
    <div className="bg-card border border-border rounded-xl p-4 sm:p-5 space-y-4">
      <div>
        <h2 className="font-display text-lg font-semibold">Sesiones activas</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Dispositivos donde tu cuenta tiene sesión. Si no reconoces alguno, ciérralo.
        </p>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}{' '}
          <button type="button" className="underline" onClick={load}>
            Reintentar
          </button>
        </p>
      )}

      {!error && mine === null && <p className="text-sm text-muted-foreground">Cargando…</p>}
      {mine && mine.length === 0 && (
        <p className="text-sm text-muted-foreground">No hay sesiones registradas todavía.</p>
      )}
      {mine && mine.length > 0 && renderList(mine, false)}

      {isBarAdmin && team.length > 0 && (
        <div className="space-y-2 pt-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Users className="h-4 w-4" aria-hidden="true" />
            Personas de tu bar
          </h3>
          {renderList(team, true)}
        </div>
      )}
    </div>
  );
}

// Ajustes > Terminales (terminal mode, docs/modo-terminal-diseno.md): the
// bar admin turns THIS device into a terminal, sees the bar's terminals and
// revokes any of them. Only from the admin's own sign-in, never from a
// terminal (the server refuses that too).
import React, { useCallback, useEffect, useState } from 'react';
import { Monitor } from 'lucide-react';
import { callFn } from '@/lib/api';
import { toast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

function when(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
}

export default function TerminalsCard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [name, setName] = useState('');
  const [mode, setMode] = useState('all');
  const [picked, setPicked] = useState(() => new Set());
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revoking, setRevoking] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await callFn('terminals', 'list'));
    } catch (err) {
      setError(err.message || 'No se pudieron cargar las terminales');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const activate = async () => {
    setBusy(true);
    try {
      const allowed = mode === 'people' ? { mode: 'people', user_ids: [...picked] } : { mode: 'all' };
      const res = await callFn('terminals', 'activate', { name: name.trim(), allowed });
      // This device now signs in as the terminal: the SDK stores the session
      // from the URL and removes it from the address bar.
      window.location.assign(`/mesas?access_token=${encodeURIComponent(res.session)}`);
    } catch (err) {
      toast({ title: 'No se pudo activar la terminal', description: err.message, variant: 'destructive' });
      setBusy(false);
      setConfirming(false);
    }
  };

  const revoke = async (device) => {
    setRevoking(device.id);
    try {
      await callFn('terminals', 'revoke', { device_id: device.id });
      toast({ title: `Terminal ${device.name} desactivada` });
      await load();
    } catch (err) {
      toast({ title: 'No se pudo desactivar', description: err.message, variant: 'destructive' });
    } finally {
      setRevoking(null);
    }
  };

  const active = (data?.terminals ?? []).filter((t) => !t.revoked_at);
  const people = data?.people ?? [];
  const canActivate = name.trim().length > 0 && (mode === 'all' || picked.size > 0);

  return (
    <div className="bg-card border border-border rounded-xl p-4 sm:p-5 space-y-4">
      <div>
        <h2 className="font-display text-lg font-semibold">Terminales</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          En una terminal cada persona entra con su PIN y lo que hace queda a su nombre. Se bloquea sola a los 2 minutos sin uso.
        </p>
      </div>

      {error ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={load}>Reintentar</Button>
        </div>
      ) : !data ? (
        <div className="w-6 h-6 border-4 border-border border-t-primary rounded-full animate-spin" role="status" aria-label="Cargando" />
      ) : (
        <>
          {active.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no hay terminales.</p>
          ) : (
            <ul className="space-y-2">
              {active.map((t) => (
                <li key={t.id} className="flex items-center gap-3 rounded-lg bg-muted px-3 py-2">
                  <Monitor className="w-4 h-4 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{t.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {t.allowed?.mode === 'people' ? `${t.allowed.user_ids.length} persona(s)` : 'Todo el equipo'}
                      {t.last_seen_at ? ` · usada ${when(t.last_seen_at)}` : ''}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" disabled={revoking === t.id} onClick={() => revoke(t)}>
                    Desactivar
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-border pt-4 space-y-3">
            <h3 className="font-medium">Usar este equipo como terminal</h3>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre del equipo, por ejemplo Caja"
              maxLength={40}
              aria-label="Nombre de la terminal"
            />
            <div className="flex gap-2 flex-wrap" role="group" aria-label="Quién puede usarla">
              <Button type="button" size="sm" className="h-10" variant={mode === 'all' ? 'default' : 'outline'} aria-pressed={mode === 'all'} onClick={() => setMode('all')}>
                Todo el equipo
              </Button>
              <Button type="button" size="sm" className="h-10" variant={mode === 'people' ? 'default' : 'outline'} aria-pressed={mode === 'people'} onClick={() => setMode('people')}>
                Algunas personas
              </Button>
            </div>
            {mode === 'people' ? (
              <ul className="space-y-2">
                {people.map((p) => (
                  <li key={p.id}>
                    <label className="flex items-center gap-3 text-sm">
                      <Checkbox
                        checked={picked.has(p.id)}
                        onCheckedChange={(on) => setPicked((prev) => {
                          const next = new Set(prev);
                          if (on) next.add(p.id); else next.delete(p.id);
                          return next;
                        })}
                      />
                      {p.name}
                    </label>
                  </li>
                ))}
              </ul>
            ) : null}
            <Button disabled={!canActivate || busy} onClick={() => setConfirming(true)}>Activar terminal</Button>
          </div>
        </>
      )}

      <AlertDialog open={confirming} onOpenChange={(open) => !busy && setConfirming(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Convertir este equipo en la terminal {name.trim()}?</AlertDialogTitle>
            <AlertDialogDescription>
              Tu sesión se cierra en este equipo y queda como terminal: aquí cada persona entra con su PIN. Para volver a
              entrar con tu correo usa otro equipo, o desactiva la terminal desde Ajustes en otro equipo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); activate(); }}>
              {busy ? 'Activando…' : 'Activar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

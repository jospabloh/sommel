// Ajustes: Cuenta y zona de peligro (módulo 7). Todo pasa por la función
// `account`; esta página nunca toca WineBar ni User directo.
//   - Exportar los datos del bar (JSON): sin candado de facturación, a propósito.
//   - Ceder el bar a otro administrador (solo el dueño).
//   - Eliminar mi cuenta (todos menos el dueño).
//   - Dar de baja el bar (solo el dueño). Retiene lo fiscal; el texto lo dice.
// Cada acción destructiva pide tres pasos: leer, entender, escribir la palabra.
// El servidor vuelve a comprobar la confirmación y el rol; esto es solo la cara.
import React, { useState } from 'react';
import { AlertTriangle, Download, Trash2, UserCog } from 'lucide-react';
import { callFn } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import { usePermission } from '@/lib/usePermission';
import { toast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { BAR_ADMIN, isWithoutEmail, personName } from '@/lib/rbac';
import { notifyMissionControl } from '@/lib/supportTickets';

const STEP_COUNT = 3;

function slug(text) {
  return String(text || 'bar')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'bar';
}

function downloadJson(payload, barName) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const day = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `sommel-${slug(barName)}-${day}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Descarga la exportación. Devuelve true si el archivo salió. */
async function exportBarData(barName) {
  try {
    const res = await callFn('account', 'exportData');
    const { ok: _ok, ...payload } = res;
    downloadJson(payload, barName);
    const problems = [...(res.errors || []).map((e) => e.entity), ...(res.truncated || [])];
    if (res.costs_redacted) {
      toast({
        title: 'Archivo sin costos',
        description: 'Tu permiso no incluye ver costos, así que el archivo no los trae. Pide a un administrador la versión completa.',
      });
    }
    if (problems.length > 0) {
      toast({
        title: 'Exportación incompleta',
        description: `Se descargó el archivo, pero falta o quedó cortado: ${[...new Set(problems)].join(', ')}. Vuelve a intentarlo o escríbenos.`,
        variant: 'destructive',
      });
    } else {
      toast({ title: 'Listo. Se descargó el archivo con los datos de tu bar.' });
    }
    return true;
  } catch (err) {
    toast({ title: 'No se pudo exportar', description: err.message, variant: 'destructive' });
    return false;
  }
}

/**
 * Confirmación en tres pasos: 1) qué va a pasar, 2) qué se conserva y qué se
 * borra (hay que marcar que se entendió), 3) escribir la palabra exacta.
 */
function ThreeStepDialog({
  open, onClose, title, intro, details, expected, expectedLabel, actionLabel, busy, onConfirm, extra, canContinue = true,
}) {
  const [step, setStep] = useState(1);
  const [understood, setUnderstood] = useState(false);
  const [typed, setTyped] = useState('');

  const close = () => {
    if (busy) return;
    setStep(1);
    setUnderstood(false);
    setTyped('');
    onClose();
  };
  const matches = typed.trim().toLowerCase() === String(expected || '').trim().toLowerCase() && typed.trim() !== '';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <p className="text-xs font-medium text-muted-foreground">Paso {step} de {STEP_COUNT}</p>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild>
            <div className="text-sm text-muted-foreground space-y-3">
              {step === 1 && intro}
              {step === 2 && details}
              {step === 3 && (
                <p>
                  Para confirmar, escribe <strong className="text-foreground break-all">{expectedLabel}</strong> en el
                  cuadro de abajo.
                </p>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        {step === 1 && extra}
        {step === 2 && (
          <label className="flex items-start gap-3 rounded-lg border border-border bg-muted p-3 cursor-pointer">
            <Checkbox checked={understood} onCheckedChange={(v) => setUnderstood(v === true)} className="mt-0.5" />
            <span className="text-sm">Entiendo lo que se borra y lo que se conserva.</span>
          </label>
        )}
        {step === 3 && (
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={expectedLabel}
            autoComplete="off"
            className="h-11"
            aria-label="Confirmación escrita"
          />
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {step === 1 ? (
            <Button variant="outline" onClick={close} disabled={busy}>Cancelar</Button>
          ) : (
            <Button variant="outline" onClick={() => setStep(step - 1)} disabled={busy}>Atrás</Button>
          )}
          {step < STEP_COUNT ? (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={!canContinue || (step === 2 && !understood)}
            >
              Continuar
            </Button>
          ) : (
            <Button variant="destructive" disabled={!matches || busy} onClick={() => onConfirm(typed.trim())}>
              {busy ? 'Procesando...' : actionLabel}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ActionRow({ icon: Icon, title, text, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 py-3 border-b border-border last:border-0">
      <Icon className="w-5 h-5 text-muted-foreground shrink-0 hidden sm:block" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{text}</p>
      </div>
      {children}
    </div>
  );
}

export default function DangerZone({ bar }) {
  const { user, logout } = useAuth();
  const { can } = usePermission();
  const isOwner = !!bar.is_owner;
  const canExport = can('Ajustes:exportar');

  const [open, setOpen] = useState(null); // 'delegate' | 'account' | 'bar' | null
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [admins, setAdmins] = useState([]);
  const [targetId, setTargetId] = useState('');

  const runExport = async () => {
    setExporting(true);
    await exportBarData(bar.name);
    setExporting(false);
  };

  const openDelegate = async () => {
    setTargetId('');
    setAdmins([]);
    setOpen('delegate');
    try {
      const res = await callFn('manageStaff', 'list');
      setAdmins((res.staff || []).filter((m) => m.app_role === BAR_ADMIN && m.id !== user?.id && !isWithoutEmail(m)));
    } catch (err) {
      toast({ title: 'No se pudo cargar el equipo', description: err.message, variant: 'destructive' });
    }
  };

  const act = async (action, payload, done) => {
    setBusy(true);
    try {
      const res = await callFn('account', action, payload);
      setOpen(null);
      await done(res);
    } catch (err) {
      toast({ title: 'No se pudo completar', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const target = admins.find((m) => m.id === targetId);

  return (
    <div className="bg-card border border-destructive/40 rounded-xl p-4 sm:p-5 space-y-2">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-5 h-5 text-destructive" />
        <h2 className="font-display text-lg font-semibold">Cuenta y zona de peligro</h2>
      </div>

      {canExport && (
        <ActionRow
          icon={Download}
          title="Exportar los datos del bar"
          text="Descarga un archivo JSON con tu menú, pedidos, pagos, turnos, inventario y asistencia. Funciona aunque tu licencia esté vencida."
        >
          <Button variant="outline" onClick={runExport} disabled={exporting} className="h-11">
            {exporting ? 'Preparando...' : 'Descargar'}
          </Button>
        </ActionRow>
      )}

      {isOwner && (
        <ActionRow
          icon={UserCog}
          title="Ceder el bar a otro administrador"
          text="La persona que elijas pasa a ser la dueña del bar. Tú sigues como administrador."
        >
          <Button variant="outline" onClick={openDelegate} className="h-11">Ceder el bar</Button>
        </ActionRow>
      )}

      {isOwner ? (
        <ActionRow
          icon={Trash2}
          title="Dar de baja el bar"
          text="El bar se archiva y todo el equipo pierde el acceso. Tus pedidos y pagos se conservan por obligación fiscal."
        >
          <Button variant="destructive" onClick={() => setOpen('bar')} className="h-11">Dar de baja</Button>
        </ActionRow>
      ) : (
        <ActionRow
          icon={Trash2}
          title="Eliminar mi cuenta"
          text="Sales del bar y tu cuenta se borra. El historial de ventas y de horas se queda con el bar."
        >
          <Button variant="destructive" onClick={() => setOpen('account')} className="h-11">Eliminar mi cuenta</Button>
        </ActionRow>
      )}
      {isOwner && (
        <p className="text-xs text-muted-foreground pt-1">
          Como dueño no puedes eliminar solo tu cuenta: cede el bar a otro administrador o dalo de baja.
        </p>
      )}

      <ThreeStepDialog
        key={`delegate-${open === 'delegate'}`}
        open={open === 'delegate'}
        onClose={() => setOpen(null)}
        title="Ceder el bar"
        intro={
          <>
            <p>Elige a quién le cedes el bar. Solo puede ser otro administrador de este mismo bar.</p>
          </>
        }
        extra={
          admins.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay otro administrador. Primero cambia el rol de alguien del equipo a administrador en Equipo.
            </p>
          ) : (
            <select
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
              aria-label="Nuevo dueño"
            >
              <option value="">Elige a una persona</option>
              {admins.map((m) => (
                <option key={m.id} value={m.id}>{personName(m) !== m.email ? `${personName(m)} (${m.email})` : m.email}</option>
              ))}
            </select>
          )
        }
        canContinue={!!target}
        details={
          <>
            <p>{target ? `${personName(target)} será la dueña o el dueño del bar.` : ''}</p>
            <p>Solo esa persona podrá cederlo de nuevo o darlo de baja. Tú te quedas como administrador.</p>
          </>
        }
        expected={target?.email}
        expectedLabel={target?.email || ''}
        actionLabel="Ceder el bar"
        busy={busy}
        onConfirm={(typed) =>
          act('delegateBar', { user_id: targetId, confirm: typed }, async () => {
            toast({ title: 'Listo. El bar ya tiene nuevo dueño.' });
            window.location.reload();
          })
        }
      />

      <ThreeStepDialog
        key={`account-${open === 'account'}`}
        open={open === 'account'}
        onClose={() => setOpen(null)}
        title="Eliminar mi cuenta"
        intro={
          <p>
            Vas a salir de <strong className="text-foreground">{bar.name}</strong>. Perderás el acceso de inmediato y
            tu cuenta se borrará.
          </p>
        }
        extra={
          canExport ? (
            <Button variant="outline" onClick={runExport} disabled={exporting} className="h-11 w-full">
              <Download className="w-4 h-4 mr-2" /> {exporting ? 'Preparando...' : 'Descargar los datos del bar antes'}
            </Button>
          ) : null
        }
        details={
          <>
            <p>Se borra: tu cuenta y tu PIN del checador. Si tienes una entrada abierta, se cierra.</p>
            <p>Se conserva en el bar: las ventas, pagos y horas registradas a tu nombre, porque son parte de su contabilidad.</p>
            <p>Si después quieres volver, un administrador tendrá que invitarte otra vez.</p>
          </>
        }
        expected={user?.email}
        expectedLabel={user?.email || ''}
        actionLabel="Eliminar mi cuenta"
        busy={busy}
        onConfirm={(typed) =>
          act('deleteMyAccount', { confirm: typed }, async (res) => {
            notifyMissionControl(res.ticket_id);
            toast({
              title: res.account_deleted === false ? 'Saliste del bar' : 'Tu cuenta se eliminó',
              description: res.account_deleted === false ? 'No pudimos borrar la cuenta en sí: escríbenos a soporte y la borramos.' : undefined,
            });
            logout();
          })
        }
      />

      <ThreeStepDialog
        key={`bar-${open === 'bar'}`}
        open={open === 'bar'}
        onClose={() => setOpen(null)}
        title="Dar de baja el bar"
        intro={
          <p>
            Vas a dar de baja <strong className="text-foreground">{bar.name}</strong>. Nadie del equipo, tú incluido,
            podrá volver a entrar.
          </p>
        }
        extra={
          canExport ? (
            <Button variant="outline" onClick={runExport} disabled={exporting} className="h-11 w-full">
              <Download className="w-4 h-4 mr-2" /> {exporting ? 'Preparando...' : 'Descargar los datos del bar antes'}
            </Button>
          ) : null
        }
        details={
          <>
            <p>
              Se borra: el acceso de todo el equipo, los PIN del checador y las invitaciones pendientes. La licencia
              queda suspendida.
            </p>
            <p>
              Se conserva: pedidos, pagos, turnos, movimientos de caja y de inventario y la asistencia del personal.
              La ley fiscal (CFF, art. 30) obliga a guardar esos registros cinco años, así que no se borran.
            </p>
            <p>Para recuperar el bar tendrás que escribir a soporte.</p>
          </>
        }
        expected={bar.name}
        expectedLabel={bar.name}
        actionLabel="Dar de baja el bar"
        busy={busy}
        onConfirm={(typed) =>
          act('deleteBar', { confirm: typed }, async (res) => {
            notifyMissionControl(res.ticket_id);
            toast({ title: 'El bar se dio de baja' });
            logout();
          })
        }
      />
    </div>
  );
}

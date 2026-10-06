// Seguridad > "Aprobar desde el celular" (bar admins): turn the option on or
// off for the bar, and register or remove THIS admin's phones. The admin's
// PIN keeps working either way.
import React, { useCallback, useEffect, useState } from 'react';
import { Smartphone, Trash2 } from 'lucide-react';
import { callFn } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { passkeysSupported, webauthnErrorText } from '@/lib/approval/webauthn';
import { registerThisPhone } from '@/lib/approval/passkeyFlow';

export default function PhoneApprovalCard() {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(null);
  const [phones, setPhones] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([callFn('settings', 'get'), callFn('security', 'passkeyList')]);
      setEnabled(!!s.bar?.approval_qr_enabled);
      setPhones(p.passkeys ?? []);
    } catch (err) {
      toast({ title: 'No se pudo cargar', description: err.message, variant: 'destructive' });
      setEnabled(false);
      setPhones([]);
    }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const toggle = async (on) => {
    setBusy(true);
    try {
      await callFn('settings', 'update', { approval_qr_enabled: on });
      setEnabled(on);
      toast({ title: on ? 'Aprobación desde el celular encendida' : 'Aprobación desde el celular apagada' });
    } catch (err) {
      toast({ title: 'No se pudo cambiar', description: err.message, variant: 'destructive' });
    }
    setBusy(false);
  };

  const register = async () => {
    setBusy(true);
    try {
      await registerThisPhone(navigator.userAgent.includes('iPhone') ? 'iPhone' : navigator.userAgent.includes('Android') ? 'Android' : 'Este equipo');
      toast({ title: 'Listo. Este equipo ya puede aprobar con Face ID o huella' });
      await load();
    } catch (err) {
      toast({ title: 'No se pudo registrar', description: err?.name ? webauthnErrorText(err) : err.message, variant: 'destructive' });
    }
    setBusy(false);
  };

  const remove = async (id) => {
    setBusy(true);
    try {
      await callFn('security', 'passkeyDelete', { passkey_id: id });
      await load();
    } catch (err) {
      toast({ title: 'No se pudo quitar', description: err.message, variant: 'destructive' });
    }
    setBusy(false);
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4 sm:p-5 mb-6 space-y-4">
      <div className="flex items-start gap-3">
        <Smartphone className="w-5 h-5 text-primary mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-medium">Aprobar desde el celular</p>
          <p className="text-sm text-muted-foreground">
            Además del PIN, la terminal puede mostrar un QR que un administrador escanea y confirma con Face ID o huella.
          </p>
        </div>
        <Switch checked={!!enabled} disabled={busy || enabled === null} onCheckedChange={toggle} aria-label="Aprobar desde el celular" />
      </div>
      {enabled ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Tus celulares registrados</p>
          {phones === null ? null : phones.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguno todavía. Abre esta pantalla en tu celular y regístralo, o regístralo la primera vez que escanees un QR.</p>
          ) : (
            <ul className="space-y-2">
              {phones.map((p) => (
                <li key={p.id} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 min-w-0 truncate">{p.label}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{new Date(p.created_at).toLocaleDateString('es-MX')}</span>
                  <Button type="button" variant="ghost" size="icon" className="h-11 w-11" disabled={busy} onClick={() => remove(p.id)} aria-label={`Quitar ${p.label}`}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {passkeysSupported() ? (
            <Button type="button" variant="outline" className="h-11" disabled={busy} onClick={register}>Registrar este equipo</Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

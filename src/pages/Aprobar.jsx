// /aprobar/:id — what an admin's phone opens after scanning the QR at the
// terminal. Shows who asks for what and approves with Face ID or fingerprint
// (a passkey registered on this phone). The first time, it registers the
// phone right here.
import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ShieldCheck, Smartphone, X } from 'lucide-react';
import { callFn } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { assertionToJSON, passkeysSupported, toGetOptions, webauthnErrorText } from '@/lib/approval/webauthn';
import { registerThisPhone } from '@/lib/approval/passkeyFlow';

function when(iso) {
  return iso ? new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '';
}

export default function Aprobar() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState(null); // approved | rejected

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await callFn('security', 'getApprovalRequest', { request_id: id }));
    } catch (err) {
      setError(err.code === 'forbidden' ? 'Solo un administrador del bar puede aprobar.' : err.message);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const approve = async () => {
    setBusy(true);
    setError(null);
    try {
      let fresh = data;
      if (!fresh.credential_ids?.length) {
        await registerThisPhone('Celular');
        fresh = await callFn('security', 'getApprovalRequest', { request_id: id });
        setData(fresh);
      }
      const cred = await navigator.credentials.get({ publicKey: toGetOptions(fresh) });
      await callFn('security', 'decideApprovalRequest', { request_id: id, approve: true, credential: assertionToJSON(cred) });
      setOutcome('approved');
    } catch (err) {
      setError(err?.name ? webauthnErrorText(err) : err.message);
    }
    setBusy(false);
  };

  const reject = async () => {
    setBusy(true);
    setError(null);
    try {
      await callFn('security', 'decideApprovalRequest', { request_id: id, approve: false });
      setOutcome('rejected');
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  const req = data?.request;
  const pending = req?.status === 'pending';

  return (
    <div className="p-4 sm:p-6 max-w-md mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-primary/15 flex items-center justify-center"><ShieldCheck className="w-6 h-6 text-primary" /></div>
        <h1 className="font-display text-2xl font-semibold">Aprobación</h1>
      </div>

      {!passkeysSupported() ? (
        <p className="text-sm text-destructive" role="alert">Este navegador no permite Face ID ni huella. Usa Safari en iPhone o Chrome en Android.</p>
      ) : null}

      {outcome ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center space-y-2">
          <p className="font-display text-xl font-semibold">{outcome === 'approved' ? 'Aprobado' : 'No aprobado'}</p>
          <p className="text-sm text-muted-foreground">Ya puedes cerrar esta pantalla. La terminal sigue sola.</p>
        </div>
      ) : !data && !error ? (
        <div className="flex justify-center py-10" role="status" aria-label="Cargando"><div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" /></div>
      ) : req ? (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{req.requested_by_name || 'Alguien del equipo'} pide a las {when(req.created_at)}:</p>
            <p className="font-display text-xl font-semibold">{req.label}</p>
          </div>
          {pending ? (
            <div className="grid gap-2">
              <Button type="button" className="min-h-12 h-auto py-3 whitespace-normal" disabled={busy || !passkeysSupported()} onClick={approve}>
                <Smartphone className="w-4 h-4" /> {data.credential_ids?.length ? 'Aprobar con Face ID o huella' : 'Registrar este celular y aprobar'}
              </Button>
              <Button type="button" variant="outline" className="min-h-12 h-auto py-3 whitespace-normal" disabled={busy} onClick={reject}>
                <X className="w-4 h-4" /> No aprobar
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {req.status === 'expired' ? 'Este código caducó. Pide que generen otro en la terminal.' : 'Esta solicitud ya no está pendiente.'}
            </p>
          )}
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
    </div>
  );
}

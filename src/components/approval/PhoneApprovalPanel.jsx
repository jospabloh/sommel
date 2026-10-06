// "Aprobar con el celular": shows a QR the admin scans. Their phone opens
// /aprobar/<id>, they confirm with Face ID or fingerprint, and this panel sees
// it approved and hands the request id back to the action.
import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { callFn } from '@/lib/api';
import { Button } from '@/components/ui/button';

const POLL_MS = 3000;

export default function PhoneApprovalPanel({ action, onApproved }) {
  const [state, setState] = useState({ phase: 'creating' }); // creating | waiting | rejected | expired | error
  const [qr, setQr] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const requestRef = useRef(null);
  const doneRef = useRef(false);

  useEffect(() => {
    let alive = true;
    let timer = null;
    doneRef.current = false;
    setState({ phase: 'creating' });
    setQr(null);

    const poll = async () => {
      if (!alive || !requestRef.current) return;
      try {
        const res = await callFn('security', 'approvalRequestStatus', { request_id: requestRef.current });
        if (!alive) return;
        if (res.status === 'approved') {
          doneRef.current = true;
          onApproved(requestRef.current);
          return;
        }
        if (res.status === 'rejected') { doneRef.current = true; setState({ phase: 'rejected', by: res.approved_by_name }); return; }
        if (res.status === 'expired' || res.status === 'cancelled' || res.status === 'missing') { doneRef.current = true; setState({ phase: 'expired' }); return; }
      } catch {
        // A failed poll is not an answer: try again on the next tick.
      }
      if (alive) timer = setTimeout(poll, POLL_MS);
    };

    (async () => {
      try {
        const { request_id } = await callFn('security', 'createApprovalRequest', { approval_action: action });
        if (!alive) return;
        requestRef.current = request_id;
        const url = `${window.location.origin}/aprobar/${request_id}`;
        setQr(await QRCode.toDataURL(url, { margin: 1, width: 240 }));
        setState({ phase: 'waiting' });
        timer = setTimeout(poll, POLL_MS);
      } catch (err) {
        if (alive) setState({ phase: 'error', message: err.message || 'No se pudo crear el código' });
      }
    })();

    return () => {
      alive = false;
      clearTimeout(timer);
      // Closing the dialog cancels a request nobody approved yet.
      if (requestRef.current && !doneRef.current) {
        callFn('security', 'cancelApprovalRequest', { request_id: requestRef.current }).catch(() => {});
      }
      requestRef.current = null;
    };
  }, [action, attempt, onApproved]);

  if (state.phase === 'creating') {
    return <div className="flex justify-center py-8" role="status" aria-label="Cargando"><div className="w-7 h-7 border-4 border-border border-t-primary rounded-full animate-spin" /></div>;
  }
  if (state.phase === 'waiting') {
    return (
      <div className="space-y-3 text-center">
        {qr ? <img src={qr} alt="Código QR para aprobar desde el celular" className="mx-auto w-56 h-56 rounded-lg bg-white p-2" /> : null}
        <p className="text-sm text-muted-foreground">
          Un administrador lo escanea con la cámara de su celular y confirma con Face ID o huella. Vale 3 minutos.
        </p>
        <p className="text-xs text-muted-foreground" aria-live="polite">Esperando aprobación…</p>
      </div>
    );
  }
  const text = state.phase === 'rejected'
    ? `${state.by || 'El administrador'} no lo aprobó.`
    : state.phase === 'expired'
      ? 'El código caducó.'
      : state.message;
  return (
    <div className="space-y-3 text-center">
      <p className="text-sm text-destructive" role="alert">{text}</p>
      <Button type="button" variant="outline" className="h-11" onClick={() => setAttempt((n) => n + 1)}>Generar otro código</Button>
    </div>
  );
}

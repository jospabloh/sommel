// Manager approval dialog, mounted once in Layout. When a staff action needs
// an admin's OK, callFn asks through approvalBroker and this dialog collects
// which admin approves and their PIN. Nothing here decides anything: the
// server checks the PIN and the role.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ShieldCheck, ArrowLeft } from 'lucide-react';
import { callFn } from '@/lib/api';
import { setApprovalHandler } from '@/lib/approval/approvalBroker';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import PinPad, { PIN_MIN } from '@/components/attendance/PinPad';

export default function ApprovalProvider({ children }) {
  const [request, setRequest] = useState(null); // { label, error }
  const [approvers, setApprovers] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [picked, setPicked] = useState(null);
  const [pin, setPin] = useState('');
  const resolveRef = useRef(null);
  const pickedRef = useRef(null);
  const lastPickRef = useRef(null); // after a wrong PIN, reopen on the same admin

  const finish = useCallback((value) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setRequest(null);
    setPin('');
    resolve?.(value);
  }, []);

  useEffect(() => setApprovalHandler((info) => new Promise((resolve) => {
    resolveRef.current?.(null);
    resolveRef.current = resolve;
    setPin('');
    setRequest(info);
  })), []);

  // Load who can approve each time the dialog opens fresh.
  const open = !!request;
  useEffect(() => {
    if (!open || approvers) return;
    setLoadError(null);
    callFn('security', 'approvers')
      .then((r) => {
        const list = r.approvers ?? [];
        setApprovers(list);
        const again = request?.error ? list.find((a) => a.id === lastPickRef.current && a.has_pin) : null;
        if (again) {
          pickedRef.current = again;
          setPicked(again);
        }
      })
      .catch((err) => setLoadError(err.message || 'No se pudo cargar a los administradores'));
  }, [open, approvers, request]);
  useEffect(() => {
    if (!open) {
      setApprovers(null);
      setPicked(null);
      pickedRef.current = null;
    }
  }, [open]);

  const submit = () => {
    const who = pickedRef.current;
    if (!who || pin.length < PIN_MIN) return;
    lastPickRef.current = who.id;
    finish({ approver_id: who.id, pin });
  };

  const choose = (a) => {
    pickedRef.current = a;
    setPicked(a);
    setPin('');
  };

  const usable = (approvers ?? []).filter((a) => a.has_pin);

  return (
    <>
      {children}
      <Dialog open={open} onOpenChange={(v) => { if (!v) finish(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-primary" /> Aprobación del encargado</DialogTitle>
            <DialogDescription>{request?.label}. Un administrador escribe su PIN.</DialogDescription>
          </DialogHeader>
          {loadError ? (
            <p className="text-sm text-destructive" role="alert">{loadError}</p>
          ) : approvers === null ? (
            <div className="flex justify-center py-6" role="status" aria-label="Cargando"><div className="w-7 h-7 border-4 border-border border-t-primary rounded-full animate-spin" /></div>
          ) : !picked ? (
            usable.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Ningún administrador tiene PIN todavía. Un administrador lo crea en Checador con el botón Mi PIN.
              </p>
            ) : (
              <div className="grid gap-2">
                {usable.map((a) => (
                  <Button key={a.id} type="button" variant="outline" className="h-14 justify-between" onClick={() => choose(a)}>
                    <span className="font-medium truncate">{a.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{a.on_shift ? 'En turno' : 'Fuera de turno'}</span>
                  </Button>
                ))}
              </div>
            )
          ) : (
            <div className="space-y-4">
              <Button type="button" variant="ghost" className="h-11 -ml-2" onClick={() => choose(null)}>
                <ArrowLeft className="w-4 h-4" /> {picked.name}
              </Button>
              <PinPad value={pin} onChange={setPin} onSubmit={submit} />
            </div>
          )}
          <p className="text-center text-sm text-destructive min-h-[1.25rem]" role="alert" aria-live="polite">{request?.error}</p>
        </DialogContent>
      </Dialog>
    </>
  );
}

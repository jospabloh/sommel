// Estado del correo del corte y, con Turno:ver_corte, "Reenviar correo" e
// "Imprimir corte". Reimprimir a propósito va por la estación de impresión.
import React, { useState } from 'react';
import { Mail, Printer, CheckCircle2, AlertTriangle } from 'lucide-react';
import { callFn } from '@/lib/api';
import { toast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { emailStatusInfo } from './helpers';

export default function CorteActions({ shift, canCorte, onEmailChanged }) {
  const [busy, setBusy] = useState(null); // 'mail' | 'print'
  const info = emailStatusInfo(shift.email_status, shift.email_error, canCorte);

  const resend = async () => {
    setBusy('mail');
    try {
      const res = await callFn('shifts', 'resendEmail', { shift_id: shift.id });
      onEmailChanged?.({ email_status: res.email_status, email_error: res.email_error || '' });
      if (res.email_status === 'enviado') toast({ title: 'Corte reenviado por correo' });
      else toast({ title: 'El correo no salió', description: emailStatusInfo('fallido', res.email_error, true).text, variant: 'destructive' });
    } catch (err) {
      toast({ title: 'No se pudo reenviar', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const print = async () => {
    setBusy('print');
    try {
      await callFn('shifts', 'printCorte', { shift_id: shift.id });
      toast({ title: 'Corte en la cola de impresión', description: 'Sale por la estación de impresión de la caja.' });
    } catch (err) {
      toast({ title: 'No se pudo mandar a imprimir', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const Icon = info.tone === 'ok' ? CheckCircle2 : AlertTriangle;

  return (
    <div className="space-y-3">
      <div
        className={cn(
          'flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm',
          info.tone === 'ok' && 'border-border bg-muted',
          info.tone === 'warn' && 'border-destructive/50 bg-destructive/10',
          info.tone === 'idle' && 'border-border bg-muted text-muted-foreground'
        )}
        role="status"
      >
        <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', info.tone === 'warn' ? 'text-destructive' : 'text-primary')} />
        <span>{info.text}</span>
      </div>
      {canCorte ? (
        <div className="flex flex-col sm:flex-row gap-2">
          <Button type="button" variant="outline" className="h-11" onClick={resend} disabled={busy !== null}>
            <Mail className="w-4 h-4 mr-2" />
            {busy === 'mail' ? 'Enviando…' : 'Reenviar correo'}
          </Button>
          <Button type="button" variant="outline" className="h-11" onClick={print} disabled={busy !== null}>
            <Printer className="w-4 h-4 mr-2" />
            {busy === 'print' ? 'Enviando…' : 'Imprimir corte'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

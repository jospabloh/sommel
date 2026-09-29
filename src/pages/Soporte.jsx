// Soporte (módulo 8): el bar abre un ticket y ve el estado de los de su bar.
// Se guarda aquí primero; el aviso a Mission Control es silencioso.
import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LifeBuoy, CheckCircle2, Send } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  TICKET_KINDS,
  createTicket,
  listBarTickets,
  ticketStatusLabel,
} from '@/lib/supportTickets';

function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function Soporte() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const tenantId = user?.tenant_id ?? null;

  // ?tipo=baja (from Cuenta) preselects the kind; anything unknown is ignored.
  const [searchParams] = useSearchParams();
  const tipo = searchParams.get('tipo');
  const [kind, setKind] = useState(Object.hasOwn(TICKET_KINDS, tipo ?? '') ? tipo : 'soporte');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const { data: tickets, isLoading, isError, refetch } = useQuery({
    queryKey: ['support-tickets', tenantId],
    queryFn: () => listBarTickets(tenantId),
    enabled: !!tenantId,
    retry: false,
  });

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await createTicket({ kind, subject, body }, { tenantId, email: user?.email });
      setSent(true);
      setSubject('');
      setBody('');
      queryClient.invalidateQueries({ queryKey: ['support-tickets', tenantId] });
    } catch (err) {
      toast({ variant: 'destructive', title: 'No se pudo enviar', description: err?.message || 'Intenta de nuevo.' });
    }
    setBusy(false);
  };

  if (!tenantId) return <div className="p-10 text-muted-foreground">Sin bar asignado.</div>;

  return (
    <div className="p-6 lg:p-10 max-w-3xl">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-11 h-11 rounded-xl bg-primary/15 flex items-center justify-center"><LifeBuoy className="w-6 h-6 text-primary" /></div>
        <div>
          <h1 className="font-display text-3xl font-semibold">Soporte</h1>
          <p className="text-muted-foreground mt-0.5">Cuéntanos qué necesitas y te respondemos por correo</p>
        </div>
      </div>

      {sent && (
        <div role="status" className="mb-6 flex items-start gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-950/50 dark:text-emerald-200">
          <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <div className="font-medium">Enviado</div>
            <div className="text-sm">Recibimos tu mensaje. Verás su estado en la lista de abajo.</div>
          </div>
        </div>
      )}

      <form onSubmit={submit} className="bg-card border border-border rounded-xl p-4 sm:p-5 space-y-4 mb-10">
        <fieldset>
          <legend className="text-sm font-medium mb-2">Tipo</legend>
          <div className="flex flex-wrap gap-2">
            {Object.entries(TICKET_KINDS).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={kind === value}
                onClick={() => setKind(value)}
                className={
                  'h-10 px-3 rounded-lg border text-sm transition-colors ' +
                  (kind === value
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-foreground border-border hover:bg-accent')
                }
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="soporte-asunto" className="text-sm font-medium block mb-1.5">Asunto</label>
          <Input id="soporte-asunto" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} required className="h-11" />
        </div>

        <div>
          <label htmlFor="soporte-detalle" className="text-sm font-medium block mb-1.5">Detalle</label>
          <Textarea id="soporte-detalle" value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} rows={5} placeholder="¿Qué pasó, en qué pantalla y a qué hora?" />
        </div>

        <Button type="submit" disabled={busy || !subject.trim()} className="h-11">
          <Send className="w-4 h-4 mr-1" /> {busy ? 'Enviando...' : 'Enviar'}
        </Button>
      </form>

      <h2 className="font-display text-xl font-semibold mb-3">Tickets de tu bar</h2>
      {isLoading ? (
        <div className="flex justify-center py-8"><div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" /></div>
      ) : isError ? (
        <div className="text-muted-foreground">
          No se pudo cargar la lista.{' '}
          <button type="button" className="underline" onClick={() => refetch()}>Reintentar</button>
        </div>
      ) : !tickets?.length ? (
        <div className="text-center py-10 text-muted-foreground">Aún no hay tickets.</div>
      ) : (
        <ul className="space-y-2">
          {tickets.map((t) => {
            const resolved = t.status === 'cerrado';
            return (
              <li key={t.id} className="bg-card border border-border rounded-xl p-4 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium break-words">{t.subject}</div>
                  <div className="text-sm text-muted-foreground mt-0.5">
                    {TICKET_KINDS[t.kind] ?? 'Soporte'}
                    {formatDate(t.created_date) ? ` · ${formatDate(t.created_date)}` : ''}
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={
                    resolved
                      ? 'shrink-0 border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-950/50 dark:text-emerald-200'
                      : 'shrink-0 border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-500/40 dark:bg-blue-950/50 dark:text-blue-200'
                  }
                >
                  {ticketStatusLabel(t.status)}
                </Badge>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

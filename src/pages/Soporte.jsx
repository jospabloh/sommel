// Soporte (módulo 8): el bar abre un ticket, ve el estado de los de su bar y
// conversa con ACACIA en cada uno (support.replyTicket).
// Se guarda aquí primero; el aviso a Mission Control es silencioso.
import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LifeBuoy, CheckCircle2, Send, ChevronDown, MessageSquare } from 'lucide-react';
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
  replyToTicket,
  ticketConversation,
  ticketStatusLabel,
} from '@/lib/supportTickets';

function formatDateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// One ticket: the conversation with ACACIA and a box to answer. Replying to a
// closed ticket reopens it (the server does that; the hint says so).
function TicketThread({ ticket, onReplied }) {
  const { toast } = useToast();
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const messages = ticketConversation(ticket);
  const closed = ticket.status === 'cerrado';

  const send = async (e) => {
    e.preventDefault();
    if (busy || !reply.trim()) return;
    setBusy(true);
    try {
      await replyToTicket(ticket.id, reply.trim());
      setReply('');
      onReplied();
    } catch (err) {
      toast({ variant: 'destructive', title: 'No se pudo enviar', description: err?.message || 'Intenta de nuevo.' });
    }
    setBusy(false);
  };

  return (
    <div className="mt-3 border-t border-border pt-3 space-y-3">
      {messages.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin mensajes todavía.</p>
      ) : (
        <ul className="space-y-2">
          {messages.map((m, i) => (
            <li
              key={i}
              className={'rounded-lg px-3 py-2 text-sm ' + (m.fromAcacia ? 'bg-primary/10 border border-primary/20' : 'bg-muted')}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground mb-1">
                <span className="font-medium text-foreground/80 break-all">{m.name}</span>
                <span>{formatDateTime(m.at)}</span>
              </div>
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={send} className="space-y-2">
        <label htmlFor={`reply-${ticket.id}`} className="sr-only">Tu respuesta</label>
        <Textarea
          id={`reply-${ticket.id}`}
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          maxLength={5000}
          rows={3}
          placeholder="Escribe tu respuesta"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {closed ? 'Si respondes, el ticket se vuelve a abrir.' : 'ACACIA recibe tu respuesta en este mismo ticket.'}
          </span>
          <Button type="submit" size="sm" disabled={busy || !reply.trim()} className="h-10">
            <Send className="w-4 h-4 mr-1" /> {busy ? 'Enviando...' : 'Responder'}
          </Button>
        </div>
      </form>
    </div>
  );
}

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
  const [openId, setOpenId] = useState(null);

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
          <p className="text-muted-foreground mt-0.5">Cuéntanos qué necesitas. Te respondemos aquí y te avisamos por correo</p>
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
            const isOpen = openId === t.id;
            const replies = Array.isArray(t.responses) ? t.responses.length : 0;
            return (
              <li key={t.id} className="bg-card border border-border rounded-xl p-4">
                <button
                  type="button"
                  onClick={() => setOpenId(isOpen ? null : t.id)}
                  aria-expanded={isOpen}
                  className="w-full flex items-start gap-3 text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium break-words">{t.subject}</div>
                    <div className="text-sm text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2">
                      <span>
                        {TICKET_KINDS[t.kind] ?? 'Soporte'}
                        {formatDate(t.created_date) ? ` · ${formatDate(t.created_date)}` : ''}
                      </span>
                      {replies > 0 && (
                        <span className="inline-flex items-center gap-1"><MessageSquare className="w-3.5 h-3.5" />{replies}</span>
                      )}
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
                  <ChevronDown className={'w-4 h-4 mt-1 shrink-0 text-muted-foreground transition-transform ' + (isOpen ? 'rotate-180' : '')} />
                </button>
                {isOpen && (
                  <TicketThread
                    ticket={t}
                    onReplied={() => queryClient.invalidateQueries({ queryKey: ['support-tickets', tenantId] })}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

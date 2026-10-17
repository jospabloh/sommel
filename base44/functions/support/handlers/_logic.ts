// Pure logic for support.replyTicket. Zero imports so `deno test` loads it.
// The limits match acaciaControl's (base44/tests/support_reply_test.ts pins it).
export const MAX_RESPONSES = 200;
export const MAX_RESPONSE_BODY = 5000;

export class LogicError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

type Ticket = { status?: string | null; responses?: unknown };
type Author = { name: string; email: string | null };

/** `full_name`, or the part of the email before the @. */
export function authorName(
  user: { display_name?: string | null; full_name?: string | null; email?: string | null } | null | undefined
): string {
  const own = String(user?.display_name ?? '').trim();
  if (own) return own;
  const full = String(user?.full_name ?? '').trim();
  if (full) return full.slice(0, 100);
  const email = String(user?.email ?? '').trim();
  return (email.split('@')[0] || 'Bar').slice(0, 100);
}

/**
 * The patch for a bar's reply. Replying to a closed ticket reopens it, so
 * ACACIA sees it as open again instead of a message landing in a closed one.
 */
export function buildBarReply(ticket: Ticket, rawBody: unknown, author: Author, nowIso: string) {
  const body = typeof rawBody === 'string' ? rawBody.trim() : '';
  if (!body) throw new LogicError(400, 'empty_reply', 'Escribe tu respuesta');
  if (body.length > MAX_RESPONSE_BODY) throw new LogicError(400, 'reply_too_long', 'La respuesta es demasiado larga');
  const list = Array.isArray(ticket.responses) ? ticket.responses : [];
  if (list.length >= MAX_RESPONSES) {
    throw new LogicError(409, 'conversation_full', 'Esta conversación ya es muy larga; abre un ticket nuevo');
  }
  const item = { author_role: 'bar', author_name: author.name, author_email: author.email, body, created_at: nowIso };
  return {
    responses: [...list, item],
    last_activity_at: nowIso,
    status: ticket.status === 'cerrado' ? 'abierto' : (ticket.status || 'abierto'),
  };
}

// support.createTicket (D9 of the Supabase migration): opening a ticket goes
// through the server, which takes the bar and the author from the session.
// The limits and kinds match the client's (src/lib/supportTickets.js).
export const TICKET_KINDS = ['soporte', 'mejora', 'baja'] as const;
export const MAX_SUBJECT = 200;
export const MAX_TICKET_BODY = 4000;

/** The new SupportTicket row. Only `kind`, `subject` and `body` come from the caller. */
export function buildNewTicket(
  input: { kind?: unknown; subject?: unknown; body?: unknown },
  tenantId: string,
  authorEmail: string | null,
  nowIso: string,
) {
  const kind = typeof input?.kind === 'string' ? input.kind : '';
  if (!(TICKET_KINDS as readonly string[]).includes(kind)) {
    throw new LogicError(400, 'invalid_kind', 'Elige un tipo de ticket.');
  }
  const subject = typeof input?.subject === 'string' ? input.subject.trim() : '';
  if (!subject) throw new LogicError(400, 'subject_required', 'Escribe un asunto.');
  const body = typeof input?.body === 'string' ? input.body.trim() : '';
  return {
    tenant_id: tenantId,
    kind,
    subject: subject.slice(0, MAX_SUBJECT),
    body: body.slice(0, MAX_TICKET_BODY),
    status: 'abierto',
    created_by_email: authorEmail ?? '',
    responses: [],
    last_activity_at: nowIso,
  };
}

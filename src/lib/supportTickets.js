// Módulo 8, lado cliente: el bar escribe el SupportTicket aquí primero
// (SupportTicket.create es tenant $or, así que el navegador puede) y después
// avisa a Mission Control con ticket-pull. Ese aviso NO lleva datos del ticket
// ni firma: solo {app, ticketId}; MC lee el registro auténtico por el puente
// (acaciaControl tickets.list), así que un cuerpo falso no puede inyectar nada.
import { base44 } from '@/api/base44Client';
import { callFn } from '@/lib/api';

export const TICKET_PULL_URL = 'https://control.acaciaco.com.mx/api/ingest/ticket-pull';
export const APP_SLUG = 'sommel';

export const TICKET_KINDS = {
  soporte: 'Algo no funciona',
  mejora: 'Una mejora',
  baja: 'Solicitud de baja',
};

// The user only ever sees "Enviado" or "Resuelto"; the internal triage state
// (en_proceso) stays behind the scenes.
export const TICKET_STATUS_LABELS = {
  abierto: 'Enviado',
  en_proceso: 'Enviado',
  cerrado: 'Resuelto',
};

export function ticketStatusLabel(status) {
  return TICKET_STATUS_LABELS[status] ?? TICKET_STATUS_LABELS.abierto;
}

/**
 * Fire-and-forget ping to Mission Control. Never throws and never blocks the
 * caller: if MC is down, the ticket still exists here and MC can pull it later.
 */
export function notifyMissionControl(ticketId) {
  if (ticketId == null || ticketId === '') return;
  try {
    fetch(TICKET_PULL_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ app: APP_SLUG, ticketId }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* best effort */
  }
}

/**
 * Creates the ticket and pings MC. `tenantId` and `email` come from the
 * signed-in user's profile (never from a form field).
 * @returns {Promise<object>} the created SupportTicket record
 */
export async function createTicket({ kind, subject, body }, { tenantId, email }) {
  if (!tenantId) throw new Error('Tu cuenta no tiene un bar asignado.');
  if (!Object.hasOwn(TICKET_KINDS, kind)) throw new Error('Elige un tipo de ticket.');
  const cleanSubject = String(subject ?? '').trim();
  if (!cleanSubject) throw new Error('Escribe un asunto.');
  const record = await base44.entities.SupportTicket.create({
    tenant_id: tenantId,
    kind,
    subject: cleanSubject.slice(0, 200),
    body: String(body ?? '').trim().slice(0, 4000),
    status: 'abierto',
    created_by_email: email ?? '',
  });
  notifyMissionControl(record?.id);
  return record;
}

/** The bar's own tickets, newest first. */
export async function listBarTickets(tenantId) {
  if (!tenantId) return [];
  const rows = await base44.entities.SupportTicket.filter({ tenant_id: tenantId }, '-created_date', 100);
  return Array.isArray(rows) ? rows : [];
}

/**
 * The bar answers ACACIA on one of its tickets (support.replyTicket), then
 * pings Mission Control so its inbox shows the new message. A reply to a
 * closed ticket reopens it.
 * @returns {Promise<object>} the updated SupportTicket record
 */
export async function replyToTicket(ticketId, body) {
  const res = await callFn('support', 'replyTicket', { ticket_id: ticketId, body });
  notifyMissionControl(ticketId);
  return res.ticket;
}

/** Original message first, then the replies, as one list for the screen. */
export function ticketConversation(ticket) {
  const out = [];
  if (ticket?.body) {
    out.push({ fromAcacia: false, name: ticket.created_by_email || 'Tu bar', body: ticket.body, at: ticket.created_date });
  }
  for (const r of Array.isArray(ticket?.responses) ? ticket.responses : []) {
    if (!r?.body) continue;
    const fromAcacia = r.author_role === 'acacia';
    out.push({ fromAcacia, name: fromAcacia ? 'ACACIA Soporte' : (r.author_name || 'Tu bar'), body: r.body, at: r.created_at });
  }
  return out;
}

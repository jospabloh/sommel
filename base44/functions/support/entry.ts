// `support` endpoint (module 8): the bar's side of a ticket conversation.
// The client still creates tickets directly on Base44; createTicket is the
// server path the Supabase port needs (the browser writes nothing there, D9).
// Replying needs this function because update is service-only. Router only:
// `handle` (from `./_guard.ts`, the generated copy, never edited here) builds
// Ctx and maps errors.
import { handle } from './_guard.ts';
import { replyTicket } from './handlers/replyTicket.ts';
import { createTicket } from './handlers/createTicket.ts';

export default function (req: Request): Promise<Response> {
  return handle(req, { replyTicket, createTicket });
}

// `support` endpoint (module 8): the bar's side of a ticket conversation.
// Creating a ticket still happens from the client (SupportTicket.create allows
// the tenant branch); replying needs this function because update is
// service-only. Router only: `handle` (from `./_guard.ts`, the generated copy,
// never edited here) builds Ctx and maps errors.
import { handle } from './_guard.ts';
import { replyTicket } from './handlers/replyTicket.ts';

export default function (req: Request): Promise<Response> {
  return handle(req, { replyTicket });
}

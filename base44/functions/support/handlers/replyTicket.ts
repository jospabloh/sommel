// support.replyTicket — someone in the bar answers ACACIA on one of the bar's
// tickets. The ticket is loaded with loadOwned, so another bar's id is a 404.
// No billing gate, on purpose: a suspended bar still has to be able to talk to
// support. No permission key either: any member of the bar can open a ticket,
// so any member can follow it up.
import { HttpError, loadOwned, type Ctx, type Route } from '../_guard.ts';
import { LogicError, authorName, buildBarReply } from './_logic.ts';

export const replyTicket: Route = async (ctx: Ctx, body: any) => {
  const ticketId = typeof body?.ticket_id === 'string' ? body.ticket_id : '';
  const ticket = await loadOwned(ctx, 'SupportTicket', ticketId);
  let patch;
  try {
    patch = buildBarReply(
      ticket,
      body?.body,
      { name: authorName(ctx.self ?? ctx.user), email: ctx.self?.email ?? ctx.user?.email ?? null },
      new Date().toISOString(),
    );
  } catch (err) {
    if (err instanceof LogicError) throw new HttpError(err.status, err.code, err.message);
    throw err;
  }
  const updated = await ctx.svc.entities.SupportTicket.update(ticket.id, patch);
  return { ticket: updated ?? { ...ticket, ...patch } };
};

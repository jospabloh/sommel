// support.createTicket — someone in the bar opens a ticket. Until now the
// client created it directly (SupportTicket.create allows the tenant branch on
// Base44); on Supabase the browser writes nothing (D9), so the server builds the
// row: the bar is ctx.tenantId and the author is the signed-in person, never a
// form field. Same exceptions as replyTicket, on purpose: no billing gate (a
// suspended bar must reach support) and no permission key (any member may).
import { HttpError, httpError, type Ctx, type Route } from '../_guard.ts';
import { LogicError, buildNewTicket } from './_logic.ts';

export const createTicket: Route = async (ctx: Ctx, body: any) => {
  if (!ctx.tenantId) httpError(403, 'no_tenant', 'No perteneces a ningún bar');
  let row;
  try {
    row = buildNewTicket(body ?? {}, ctx.tenantId, ctx.self?.email ?? ctx.user?.email ?? null, new Date().toISOString());
  } catch (err) {
    if (err instanceof LogicError) throw new HttpError(err.status, err.code, err.message);
    throw err;
  }
  const ticket = await ctx.svc.entities.SupportTicket.create(row);
  return { ticket };
};

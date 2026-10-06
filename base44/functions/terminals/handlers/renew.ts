// terminals.renew: slides the 15-minute pass while the person keeps working.
// Needs a valid pass already (the guard checked it), so a lock is final.
import { httpError, issuePass, type Ctx, type Route } from '../_guard.ts';
import { displayName } from '../_terminal_logic.ts';

export const renew: Route = async (ctx: Ctx) => {
  if (!ctx.terminal?.unlocked) httpError(403, 'not_terminal', 'Esta acción solo se usa desde una terminal');
  const { pass, expires_at } = await issuePass(ctx, ctx.self.id);
  return { pass, expires_at, person: { id: ctx.self.id, name: displayName(ctx.self), email: ctx.self.email ?? '', app_role: ctx.self.app_role } };
};

// terminals.lock: "Cambiar usuario" and the 2-minute lock. Bumps the pass
// epoch so the pass that was in use stops working on the server too, not only
// in this browser's memory.
import { allowLockedTerminal, passEpochOf, type Ctx } from '../_guard.ts';
import { requireTerminal } from './_shared.ts';

export const lock = allowLockedTerminal(async (ctx: Ctx) => {
  const device = requireTerminal(ctx);
  await ctx.svc.entities.TerminalDevice.update(device.id, { pass_epoch: passEpochOf(device) + 1, unlocked_user_id: null, unlocked_at: null });
  return {};
});

// `terminals` endpoint: terminal mode (docs/modo-terminal-diseno.md, phase 2a).
// Router only: `handle` (from the generated `_guard.ts`) builds Ctx, which is
// where a terminal's pass is checked. Managing terminals never runs from a
// terminal (`remoteOnly`); whoAmI and unlock run while it is locked.
import { handle, remoteOnly } from './_guard.ts';
import { activate } from './handlers/activate.ts';
import { list } from './handlers/list.ts';
import { revoke } from './handlers/revoke.ts';
import { whoAmI } from './handlers/whoAmI.ts';
import { unlock } from './handlers/unlock.ts';
import { renew } from './handlers/renew.ts';

export default function (req: Request): Promise<Response> {
  return handle(req, {
    activate: remoteOnly(activate),
    list: remoteOnly(list),
    revoke: remoteOnly(revoke),
    whoAmI,
    unlock,
    renew,
  });
}

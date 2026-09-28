// `printing` endpoint (Impresión): entrega-2-contratos.md §5 "printing".
// Router only: `handle()` (canonical `_guard.ts`) does requireContext,
// dispatch and error mapping; each handler runs its own guard order.
import { handle } from './_guard.ts';
import { queue } from './handlers/queue.ts';
import { claimNext } from './handlers/claimNext.ts';
import { markPrinted } from './handlers/markPrinted.ts';
import { markFailed } from './handlers/markFailed.ts';
import { retry } from './handlers/retry.ts';
import { reprint } from './handlers/reprint.ts';

export default function (req: Request): Promise<Response> {
  return handle(req, { queue, claimNext, markPrinted, markFailed, retry, reprint });
}

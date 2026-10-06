// `printing` endpoint (Impresión): entrega-2-contratos.md §5 "printing".
// Router only: `handle()` (canonical `_guard.ts`) does requireContext,
// dispatch and error mapping; each handler runs its own guard order.
import { allowLockedTerminal, freshReads, handle, remoteOnly } from './_guard.ts';
import { queue } from './handlers/queue.ts';
import { claimNext } from './handlers/claimNext.ts';
import { markPrinted } from './handlers/markPrinted.ts';
import { markFailed } from './handlers/markFailed.ts';
import { retry } from './handlers/retry.ts';
import { reprint } from './handlers/reprint.ts';
import { cloudAdd, cloudList, cloudRevoke, cloudUpdate } from './handlers/cloudPrinters.ts';

export default function (req: Request): Promise<Response> {
  // Terminal mode: a locked terminal keeps its print station running (it
  // prints by device, not by person); retry and reprint need a person.
  return handle(req, {
    queue: allowLockedTerminal(queue),
    claimNext: allowLockedTerminal(claimNext),
    markPrinted: allowLockedTerminal(markPrinted),
    markFailed: allowLockedTerminal(markFailed),
    retry,
    reprint,
    // Star CloudPRNT printers: the bar admin, from their own sign-in.
    cloudList: freshReads(remoteOnly(cloudList)),
    cloudAdd: freshReads(remoteOnly(cloudAdd)),
    cloudUpdate: freshReads(remoteOnly(cloudUpdate)),
    cloudRevoke: freshReads(remoteOnly(cloudRevoke)),
  });
}

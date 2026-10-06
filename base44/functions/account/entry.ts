// `account` endpoint (module 7). Router only: `handle` (from `./_guard.ts`, the
// generated copy, never edited here) builds Ctx and maps errors.
import { freshReads, handle, remoteOnly } from './_guard.ts';
import { deleteBar } from './handlers/deleteBar.ts';
import { deleteMyAccount } from './handlers/deleteMyAccount.ts';
import { delegateBar } from './handlers/delegateBar.ts';
import { exportData } from './handlers/exportData.ts';

export default function (req: Request): Promise<Response> {
  // Terminal mode: none of these run from a shared terminal. Account actions
  // decide on ownership, so they never use the 20 s cache.
  return handle(req, {
    exportData: freshReads(remoteOnly(exportData)),
    deleteMyAccount: freshReads(remoteOnly(deleteMyAccount)),
    delegateBar: freshReads(remoteOnly(delegateBar)),
    deleteBar: freshReads(remoteOnly(deleteBar)),
  });
}

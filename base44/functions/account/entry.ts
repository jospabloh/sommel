// `account` endpoint (module 7). Router only: `handle` (from `./_guard.ts`, the
// generated copy, never edited here) builds Ctx and maps errors.
import { handle, remoteOnly } from './_guard.ts';
import { deleteBar } from './handlers/deleteBar.ts';
import { deleteMyAccount } from './handlers/deleteMyAccount.ts';
import { delegateBar } from './handlers/delegateBar.ts';
import { exportData } from './handlers/exportData.ts';

export default function (req: Request): Promise<Response> {
  // Terminal mode: none of these run from a shared terminal.
  return handle(req, {
    exportData: remoteOnly(exportData),
    deleteMyAccount: remoteOnly(deleteMyAccount),
    delegateBar: remoteOnly(delegateBar),
    deleteBar: remoteOnly(deleteBar),
  });
}

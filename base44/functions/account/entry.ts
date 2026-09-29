// `account` endpoint (module 7). Router only: `handle` (from `./_guard.ts`, the
// generated copy, never edited here) builds Ctx and maps errors.
import { handle } from './_guard.ts';
import { deleteBar } from './handlers/deleteBar.ts';
import { deleteMyAccount } from './handlers/deleteMyAccount.ts';
import { delegateBar } from './handlers/delegateBar.ts';
import { exportData } from './handlers/exportData.ts';

export default function (req: Request): Promise<Response> {
  return handle(req, { exportData, deleteMyAccount, delegateBar, deleteBar });
}

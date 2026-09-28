// `shifts` (Turno) endpoint — entrega-2-contratos.md §5 "shifts".
// Router only: `handle()` (from the canonical `_guard.ts`, nobody edits that
// copy) does requireContext/dispatch/error-mapping; every action's own order
// of checks lives in its handler.
import { handle } from './_guard.ts';
import { current } from './handlers/current.ts';
import { open } from './handlers/open.ts';
import { addCashOut } from './handlers/addCashOut.ts';
import { close } from './handlers/close.ts';
import { list } from './handlers/list.ts';
import { resendEmail } from './handlers/resendEmail.ts';
import { printCorte } from './handlers/printCorte.ts';

export default function (req: Request): Promise<Response> {
  return handle(req, { current, open, addCashOut, close, list, resendEmail, printCorte });
}

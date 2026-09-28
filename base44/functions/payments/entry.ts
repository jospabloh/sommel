// `payments` (Cobro) endpoint — entrega-2-contratos.md §5 "payments".
// Router only: `handle()` (canonical `_guard.ts`, nobody edits that copy)
// does requireContext/dispatch/error-mapping; each handler owns its own
// order of checks (loadOwned -> requirePermission -> requireWritable ->
// validation -> write).
import { handle } from './_guard.ts';
import { summary } from './handlers/summary.ts';
import { applyDiscount } from './handlers/applyDiscount.ts';
import { setTip } from './handlers/setTip.ts';
import { splitPreview } from './handlers/splitPreview.ts';
import { addPayment } from './handlers/addPayment.ts';
import { voidPayment } from './handlers/voidPayment.ts';
import { requestTicket } from './handlers/requestTicket.ts';

export default function (req: Request): Promise<Response> {
  return handle(req, {
    summary,
    applyDiscount,
    setTip,
    splitPreview,
    addPayment,
    voidPayment,
    requestTicket,
  });
}

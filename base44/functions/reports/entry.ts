// `reports` endpoint (Reportes) — entrega-2-contratos.md §5 "reports".
// Router only: `handle()` (from the canonical `_guard.ts`) does
// requireContext/dispatch/error-mapping; the action's own checks live in
// its handler.
import { handle } from './_guard.ts';
import { summary } from './handlers/summary.ts';

export default function (req: Request): Promise<Response> {
  return handle(req, { summary });
}

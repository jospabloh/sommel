// `settings` endpoint (entrega-2-contratos.md §5). Router only.
import { handle } from './_guard.ts';
import { get } from './handlers/get.ts';
import { update } from './handlers/update.ts';

export default function (req: Request): Promise<Response> {
  return handle(req, { get, update });
}

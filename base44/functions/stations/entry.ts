import { handle } from './_guard.ts';
import { markReady } from './handlers/markReady.ts';
import { markDelivered } from './handlers/markDelivered.ts';
import { undoReady } from './handlers/undoReady.ts';
import { getConfig } from './handlers/getConfig.ts';

// Router for the `stations` endpoint (entrega-1-contratos.md §4). `handle`
// (from `./_guard.ts`, the canonical copy — never edited here) parses the
// body, builds `Ctx` once, dispatches on `action`, and maps `HttpError` to
// the `{ error, code }` response shape. Each handler still does its own
// loadOwned -> requirePermission -> requireWritable in that order (§2).
export default function (req: Request): Promise<Response> {
  return handle(req, {
    markReady,
    markDelivered,
    undoReady,
    getConfig,
  });
}

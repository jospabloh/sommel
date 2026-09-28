// `inventory` endpoint (entrega-2-contratos.md §5). Router only: `handle()`
// (canonical `_guard.ts`, never edited here) does auth/dispatch/error
// mapping; each handler runs auth -> loadOwned -> permission ->
// requireWritable -> validation -> write. Stock is never written by the
// client: every movement recomputes it as the sum of the item's movements.
import { handle } from './_guard.ts';
import { list } from './handlers/list.ts';
import { movements } from './handlers/movements.ts';
import { upsertItem } from './handlers/upsertItem.ts';
import { addEntry } from './handlers/addEntry.ts';
import { addWaste } from './handlers/addWaste.ts';
import { count } from './handlers/count.ts';
import { linkProduct } from './handlers/linkProduct.ts';

export default function (req: Request): Promise<Response> {
  return handle(req, { list, movements, upsertItem, addEntry, addWaste, count, linkProduct });
}

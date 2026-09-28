// `orders` (Comandas) endpoint — entrega-1-contratos.md §4 "orders".
// Router only: `handle()` (from the canonical `_guard.ts` — nobody edits that
// copy, contract §2) does requireContext/dispatch/error-mapping; every
// action's own order of checks (loadOwned -> requirePermission ->
// requireWritable -> validation -> write) lives in its handler.
import { handle } from './_guard.ts';
import { open } from './handlers/open.ts';
import { addItems } from './handlers/addItems.ts';
import { updateItem } from './handlers/updateItem.ts';
import { removeItem } from './handlers/removeItem.ts';
import { send } from './handlers/send.ts';
import { cancelItem } from './handlers/cancelItem.ts';
import { moveTable } from './handlers/moveTable.ts';
import { mergeOrders } from './handlers/mergeOrders.ts';
import { cancelOrder } from './handlers/cancelOrder.ts';
import { upsertTable } from './handlers/upsertTable.ts';
import { deleteTable } from './handlers/deleteTable.ts';

export default function (req: Request): Promise<Response> {
  return handle(req, {
    open,
    addItems,
    updateItem,
    removeItem,
    send,
    cancelItem,
    moveTable,
    mergeOrders,
    cancelOrder,
    upsertTable,
    deleteTable,
  });
}

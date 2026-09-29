import { handle, allowNoTenant } from './_guard.ts';
import { listProducts } from './handlers/listProducts.ts';
import { upsertCategory } from './handlers/upsertCategory.ts';
import { deleteCategory } from './handlers/deleteCategory.ts';
import { upsertProduct } from './handlers/upsertProduct.ts';
import { toggleProduct } from './handlers/toggleProduct.ts';
import { importMenu } from './handlers/importMenu.ts';

// Router for the `catalog` endpoint (entrega-1-contratos.md §4). `handle`
// (from `./_guard.ts`, the canonical copy — never edited here) parses the
// body, builds `Ctx` once, dispatches on `action`, and maps `HttpError` to
// the `{ error, code }` response shape. Each handler still does its own
// loadOwned -> requirePermission -> requireWritable in that order (§2).
export default function (req: Request): Promise<Response> {
  return handle(req, {
    listProducts,
    upsertCategory,
    deleteCategory,
    upsertProduct,
    toggleProduct,
    // Module 14: the only route a platform admin with no bar may call.
    importMenu: allowNoTenant(importMenu),
  });
}

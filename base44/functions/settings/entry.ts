// `settings` endpoint (entrega-2-contratos.md §5). Router only.
import { allowNoTenant, freshReads, handle } from './_guard.ts';
import { billing } from './handlers/billing.ts';
import { get } from './handlers/get.ts';
import { update } from './handlers/update.ts';
import { platformListBars, platformSetLicense } from './handlers/platformBars.ts';

export default function (req: Request): Promise<Response> {
  return handle(req, {
    billing,
    // Ajustes shows what was just saved: no 20 s cache here.
    get: freshReads(get),
    update: freshReads(update),
    // Platform-only panel actions. They check ctx.isPlatform themselves; a
    // non-platform caller without a bar still gets 403 from the guard.
    platformListBars: freshReads(allowNoTenant(platformListBars)),
    platformSetLicense: freshReads(allowNoTenant(platformSetLicense)),
  });
}

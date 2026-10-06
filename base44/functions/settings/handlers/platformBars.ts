// settings.platformListBars / settings.platformSetLicense: the platform panel
// (src/pages/SuperAdmin.jsx) without any browser-side entity write. Both are
// platform-only (403 otherwise) and are the only settings routes registered
// with allowNoTenant in entry.ts: the platform admin has no bar of their own.
// Mission Control stays the primary owner of the license (module 1); this is
// the manual adjustment, and every change leaves a WineBar.license_audit entry.
import { httpError, type Ctx, forgetBar } from '../_guard.ts';
import {
  appendAudit,
  cleanNote,
  diffLicense,
  projectBar,
  validateLicensePatch,
} from './_platformLogic.ts';

const MAX_BARS = 200;
const ORDER_CAP = 5000;

function requirePlatform(ctx: Ctx) {
  if (!ctx.isPlatform) httpError(403, 'forbidden', 'Solo la plataforma puede hacer esto');
}

export async function platformListBars(ctx: Ctx, _body: any) {
  requirePlatform(ctx);
  const bars = await ctx.svc.entities.WineBar.list('-created_date', MAX_BARS);
  const rows = await Promise.all(
    bars.map(async (b: any) => {
      // A count that fails shows as zero for that bar; it must not sink the list.
      const [prods, ords] = await Promise.all([
        ctx.svc.entities.Product.filter({ tenant_id: b.id }, '-updated_date', ORDER_CAP).catch(() => []),
        ctx.svc.entities.Order.filter({ tenant_id: b.id, status: 'cobrada' }, '-closed_at', ORDER_CAP).catch(() => []),
      ]);
      const revenue = ords.reduce((s: number, o: any) => s + (Number.isInteger(o.total) ? o.total : 0), 0);
      return projectBar(b, { products: prods.length, orders: ords.length, revenue_cents: revenue });
    })
  );
  return { bars: rows };
}

export async function platformSetLicense(ctx: Ctx, body: any) {
  requirePlatform(ctx);
  const barId = typeof body?.bar_id === 'string' ? body.bar_id : '';
  if (!barId) httpError(400, 'invalid_body', 'Falta el bar');
  const checked = validateLicensePatch(body?.patch);
  if ('error' in checked) httpError(400, 'invalid_body', checked.error);

  // Re-read the stored bar: the "before" values come from the store, never the body.
  const [bar] = await ctx.svc.entities.WineBar.filter({ id: barId });
  if (!bar) httpError(404, 'not_found', 'No se encontró el bar');

  const diff = diffLicense(bar, checked.patch);
  if (!diff) return { bar: projectBar(bar, { products: 0, orders: 0, revenue_cents: 0 }), unchanged: true };

  const entry = {
    by: ctx.self?.email ?? ctx.user?.email ?? ctx.user?.id ?? 'plataforma',
    at: new Date().toISOString(),
    before: diff.before,
    after: diff.after,
    note: cleanNote(body?.note),
  };
  const patch = { ...diff.after, license_audit: appendAudit(bar.license_audit, entry) };
  const updated = await ctx.svc.entities.WineBar.update(barId, patch);
  forgetBar(barId);
  return { bar: projectBar({ ...bar, ...patch, ...(updated ?? {}) }, { products: 0, orders: 0, revenue_cents: 0 }) };
}

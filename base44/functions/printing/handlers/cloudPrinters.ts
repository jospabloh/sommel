// printing.cloudList / cloudAdd / cloudUpdate / cloudRevoke (2026-10-06):
// the bar admin manages Star CloudPRNT printers. The password is generated
// here, shown ONCE (cloudAdd), and only its SHA-256 is stored; the printer
// sends it to the `cloudprnt` function on every poll.
import { httpError, personName, randomHex, requireWritable, type Ctx, type Route } from '../_guard.ts';
import { PRINT_KINDS } from './_logic.ts';

const MAX_PRINTERS = 10;
const FORMATS = ['starprnt', 'text'];

function requireAdmin(ctx: Ctx): string {
  if (!ctx.tenantId || ctx.appRole !== 'bar_admin') httpError(403, 'forbidden', 'Solo un administrador del bar maneja las impresoras');
  return ctx.tenantId as string;
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function cleanName(raw: unknown): string {
  const v = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  if (v.length < 1 || v.length > 40) httpError(400, 'invalid_name', 'Ponle un nombre de 1 a 40 letras, por ejemplo Cocina');
  return v;
}

/** Known kinds only; at least one. */
function cleanKinds(raw: unknown): string[] {
  if (!Array.isArray(raw)) httpError(400, 'kinds_invalid', 'Elige qué imprime');
  const set = (PRINT_KINDS as readonly string[]).filter((k) => (raw as unknown[]).includes(k));
  if (set.length === 0) httpError(400, 'kinds_invalid', 'Elige al menos un tipo de trabajo');
  return set;
}

function cleanFormat(raw: unknown): string {
  if (raw === undefined) return 'starprnt';
  if (!FORMATS.includes(raw as string)) httpError(400, 'invalid_format', 'Formato no válido');
  return raw as string;
}

/** What the screen sees: never the hash. */
function view(p: any) {
  return {
    id: p.id,
    name: p.name,
    kinds: Array.isArray(p.kinds) ? p.kinds : [],
    format: p.format === 'text' ? 'text' : 'starprnt',
    mac: p.mac ?? '',
    last_seen_at: p.last_seen_at ?? null,
    last_status: p.last_status ?? '',
    created_at: p.created_at ?? null,
  };
}

async function loadMine(ctx: Ctx, tenantId: string, id: unknown): Promise<any> {
  const pid = typeof id === 'string' && id.length <= 64 ? id : '';
  const [row] = pid ? await ctx.svc.entities.CloudPrinter.filter({ id: pid }) : [];
  if (!row || row.tenant_id !== tenantId || row.revoked_at) httpError(404, 'not_found', 'No se encontró esa impresora');
  return row;
}

export const cloudList: Route = async (ctx: Ctx) => {
  const tenantId = requireAdmin(ctx);
  const rows = await ctx.svc.entities.CloudPrinter.filter({ tenant_id: tenantId });
  return { printers: rows.filter((r: any) => !r.revoked_at).map(view) };
};

export const cloudAdd: Route = async (ctx: Ctx, body: any) => {
  const tenantId = requireAdmin(ctx);
  requireWritable(ctx);
  const name = cleanName(body?.name);
  const kinds = cleanKinds(body?.kinds);
  const format = cleanFormat(body?.format);
  const live = (await ctx.svc.entities.CloudPrinter.filter({ tenant_id: tenantId })).filter((r: any) => !r.revoked_at);
  if (live.length >= MAX_PRINTERS) httpError(409, 'too_many_printers', `Ya hay ${MAX_PRINTERS} impresoras en la nube. Quita una antes`);
  const secret = randomHex(16);
  const row = await ctx.svc.entities.CloudPrinter.create({
    tenant_id: tenantId,
    name,
    kinds,
    format,
    secret_hash: await sha256Hex(secret),
    created_by_id: ctx.self.id,
    created_by_name: personName(ctx.self),
    created_at: new Date().toISOString(),
    last_seen_at: null,
    revoked_at: null,
  });
  // The only time the password leaves the server.
  return { printer: view(row), credentials: { user: row.id, password: secret } };
};

export const cloudUpdate: Route = async (ctx: Ctx, body: any) => {
  const tenantId = requireAdmin(ctx);
  requireWritable(ctx);
  const row = await loadMine(ctx, tenantId, body?.printer_id);
  const patch: Record<string, unknown> = {};
  if (body?.name !== undefined) patch.name = cleanName(body.name);
  if (body?.kinds !== undefined) patch.kinds = cleanKinds(body.kinds);
  if (body?.format !== undefined) patch.format = cleanFormat(body.format);
  if (Object.keys(patch).length === 0) httpError(400, 'nothing_to_update', 'No hay cambios que guardar');
  const updated = await ctx.svc.entities.CloudPrinter.update(row.id, patch);
  return { printer: view({ ...row, ...patch, ...(updated ?? {}) }) };
};

export const cloudRevoke: Route = async (ctx: Ctx, body: any) => {
  const tenantId = requireAdmin(ctx);
  const row = await loadMine(ctx, tenantId, body?.printer_id);
  // Kept (not deleted) so its jobs still say which printer took them.
  await ctx.svc.entities.CloudPrinter.update(row.id, { revoked_at: new Date().toISOString() });
  return { revoked: true };
};

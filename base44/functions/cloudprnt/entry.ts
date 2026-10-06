// `cloudprnt`: the endpoint a Star CloudPRNT printer polls by itself (no
// session, no browser). Auth is the printer's own id and secret (HTTP Basic,
// or ?id=&k=), checked against the hash stored on its CloudPrinter row.
//   POST   → is there a job for me?  { jobReady, mediaTypes, jobToken }
//   GET    → the job's bytes (claims it, like printing.claimNext)
//   DELETE → the printer's result: 2xx = impreso, anything else = fallido
// Every poll spends Base44 quota (shared by all bars), so the printer row and
// the bar are cached 20 s and last_seen_at is written at most once a minute.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import {
  MEDIA_TYPE,
  SEEN_WRITE_EVERY_MS,
  barCanPrint,
  claimId,
  confirmOutcome,
  normalizeFormat,
  parseCredentials,
  pickJob,
  printerKinds,
  renderJob,
  sameDigest,
  sha256Hex,
} from './_logic.ts';

const CACHE_MS = 20_000;
const cache = new Map<string, { at: number; value: any }>();
async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
}

const json = (status: number, body: unknown) => Response.json(body, { status });
const unauthorized = () =>
  new Response(JSON.stringify({ error: 'unauthorized', code: 'unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Basic realm="Sommel"' },
  });

/** The SDK only accepts Bearer in Authorization; the printer sends Basic. */
function withoutAuth(req: Request): Request {
  const headers = new Headers(req.headers);
  headers.delete('authorization');
  return new Request(req.url, { method: 'GET', headers });
}

export default async function (req: Request): Promise<Response> {
  const url = new URL(req.url);
  const creds = parseCredentials(req.headers.get('authorization'), url);
  if (!creds || creds.id.length > 64 || creds.secret.length > 200) return unauthorized();

  try {
    const svc = createClientFromRequest(withoutAuth(req)).asServiceRole;
    const printer = await cached(`p:${creds.id}`, async () => (await svc.entities.CloudPrinter.filter({ id: creds.id }))[0] ?? null);
    if (!printer || printer.revoked_at || !sameDigest(await sha256Hex(creds.secret), printer.secret_hash)) {
      cache.delete(`p:${creds.id}`); // a revoked or changed printer is re-read next time
      return unauthorized();
    }
    const tenantId = printer.tenant_id;
    const mine = claimId(printer.id);
    const kinds = printerKinds(printer.kinds);
    const format = normalizeFormat(printer.format);
    const nowMs = Date.now();

    if (req.method === 'POST') {
      const poll = await req.json().catch(() => ({}));
      const seen = Date.parse(printer.last_seen_at ?? '');
      if (Number.isNaN(seen) || nowMs - seen > SEEN_WRITE_EVERY_MS) {
        const patch = {
          last_seen_at: new Date(nowMs).toISOString(),
          last_status: String(poll?.statusCode ?? '').slice(0, 80),
          mac: String(poll?.printerMAC ?? printer.mac ?? '').slice(0, 40),
        };
        await svc.entities.CloudPrinter.update(printer.id, patch).catch(() => {});
        printer.last_seen_at = patch.last_seen_at;
      }
      const bar = await cached(`b:${tenantId}`, async () => (await svc.entities.WineBar.filter({ id: tenantId }))[0] ?? null);
      if (!barCanPrint(bar)) return json(200, { jobReady: false });
      const jobs = await svc.entities.PrintJob.filter(
        { tenant_id: tenantId, status: { $in: ['pendiente', 'reclamado'] }, kind: { $in: kinds } },
        'created_date',
        50
      );
      const job = pickJob(jobs ?? [], kinds, nowMs);
      if (!job) return json(200, { jobReady: false });
      return json(200, { jobReady: true, mediaTypes: [MEDIA_TYPE[format]], jobToken: job.id, deleteMethod: 'DELETE' });
    }

    const token = url.searchParams.get('token') ?? '';
    const [job] = token && token.length <= 64 ? await svc.entities.PrintJob.filter({ id: token }) : [];
    // Another bar's job and a missing one answer the same.
    if (!job || job.tenant_id !== tenantId) return json(404, { error: 'not_found', code: 'not_found' });

    const confirming = req.method === 'DELETE' || (req.method === 'GET' && url.searchParams.has('delete'));
    if (confirming) {
      if (job.status !== 'reclamado' || job.claimed_by !== mine) return json(200, { ok: true, ignored: true });
      const outcome = confirmOutcome(url.searchParams.get('code'));
      await svc.entities.PrintJob.update(job.id, {
        status: outcome.status,
        error: outcome.error,
        ...(outcome.status === 'impreso' ? { printed_at: new Date().toISOString() } : {}),
      });
      return json(200, { ok: true, status: outcome.status });
    }

    if (req.method !== 'GET') return json(405, { error: 'Método no permitido', code: 'method_not_allowed' });

    // Download: claim it unless this printer already holds it (a retried GET).
    const alreadyMine = job.status === 'reclamado' && job.claimed_by === mine;
    if (!alreadyMine) {
      if (!pickJob([job], kinds, nowMs)) return json(404, { error: 'not_found', code: 'not_found' });
      await svc.entities.PrintJob.update(job.id, {
        status: 'reclamado',
        claimed_by: mine,
        claimed_at: new Date(nowMs).toISOString(),
        attempts: (job.attempts ?? 0) + 1,
        error: '',
      });
      // Two printers (or a browser station) can claim at once: the stored row decides.
      const [reread] = await svc.entities.PrintJob.filter({ id: job.id });
      if (!reread || reread.status !== 'reclamado' || reread.claimed_by !== mine) {
        return json(404, { error: 'claimed_elsewhere', code: 'claimed_elsewhere' });
      }
    }
    const { body, type } = renderJob(job, format);
    return new Response(body as Uint8Array<ArrayBuffer>, { status: 200, headers: { 'Content-Type': type } });
  } catch (err) {
    console.error('cloudprnt failed', (err as Error).message);
    return json(500, { error: 'internal_error', code: 'internal_error' });
  }
}

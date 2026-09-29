import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { STALE_AFTER_MS, cronVerdict, purgePatch, selectStale } from './_purge_logic.ts';

// purgeStaleSessions (module 20, layer 3): closes sessions whose device never
// came back (dead battery, killed tab), which no client-side timer can do.
// Scheduled with Authorization: Bearer <CRON_SECRET>. Fails closed: no
// CRON_SECRET means 503 and nothing runs. Reaps active AND passive rows older
// than 48 h; the next heartbeat of that device then answers 403 session_revoked.
const PAGE = 500;
const MAX_PAGES = 20;

export default async function (req: Request): Promise<Response> {
  const verdict = cronVerdict(Deno.env.get('CRON_SECRET'), req.headers.get('authorization'));
  if (!verdict.ok) return Response.json({ error: verdict.code, code: verdict.code }, { status: verdict.status });

  try {
    const svc = createClientFromRequest(req).asServiceRole;
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    let scanned = 0;
    let revoked = 0;
    let failed = 0;
    for (let page = 0; page < MAX_PAGES; page++) {
      const rows = await svc.entities.AppSession.list('-created_date', PAGE, page * PAGE);
      if (!rows || rows.length === 0) break;
      scanned += rows.length;
      for (const row of selectStale(rows, nowMs)) {
        try {
          await svc.entities.AppSession.update(row.id, purgePatch(nowIso));
          revoked++;
        } catch {
          failed++;
        }
      }
      if (rows.length < PAGE) break;
    }
    return Response.json({ ok: true, scanned, revoked, failed, cutoff: new Date(nowMs - STALE_AFTER_MS).toISOString() });
  } catch (e) {
    console.error('purgeStaleSessions failed', (e as Error).message);
    return Response.json({ error: 'internal_error', code: 'internal_error' }, { status: 500 });
  }
}

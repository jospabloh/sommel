import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import {
  AUTH_SHAPES, HOSTS, PROBE_EMAIL, authHeaders, locationHasAccessToken, probeAllowed, type AuthShape,
} from './_probe_logic.ts';

// terminals: terminal mode (docs/modo-terminal-diseno.md). For now it holds
// only `probeProvisioning`, a platform-only diagnostic that checks whether the
// BASE44_SOMMEL_TOKEN secret can provision a terminal account and mint its
// sign-in, then deletes that account. It returns status codes and booleans
// only: never the token, the one-time token or the session.
async function probe(appId: string, token: string) {
  const attempts: Array<{ host: string; auth: AuthShape; status: number }> = [];
  for (const host of HOSTS) {
    for (const auth of AUTH_SHAPES) {
      const headers = { 'Content-Type': 'application/json', ...authHeaders(auth, token) };
      const base = `${host}/api/apps/${appId}`;
      let res: Response;
      try {
        res = await fetch(`${base}/users/provisions`, {
          method: 'POST', headers, body: JSON.stringify({ email: PROBE_EMAIL, role: 'user', full_name: 'Prueba terminal' }),
        });
      } catch {
        attempts.push({ host, auth, status: 0 });
        continue;
      }
      const provision = await res.json().catch(() => ({}));
      attempts.push({ host, auth, status: res.status });
      if (!res.ok) continue;

      const out: Record<string, unknown> = { host, auth, provision_status: provision?.status ?? null };
      try {
        const mint = await fetch(`${base}/embed-tokens`, { method: 'POST', headers, body: JSON.stringify({ email: PROBE_EMAIL }) });
        out.mint_status = mint.status;
        const body = await mint.json().catch(() => ({}));
        if (mint.ok && body?.embed_url) {
          const land = await fetch(body.embed_url, { redirect: 'manual' });
          out.embed_status = land.status;
          out.session_issued = locationHasAccessToken(land.headers.get('location'));
        }
      } finally {
        const del = await fetch(`${base}/users/provisions`, { method: 'DELETE', headers, body: JSON.stringify({ email: PROBE_EMAIL }) });
        out.deprovision_status = del.status;
      }
      return { ok: true, working: out, attempts };
    }
  }
  return { ok: false, attempts };
}

export default async function (req: Request): Promise<Response> {
  let user;
  const base44 = createClientFromRequest(req);
  try {
    user = await base44.auth.me();
  } catch {
    user = null;
  }
  if (!user) return Response.json({ error: 'Inicia sesión para continuar', code: 'unauthenticated' }, { status: 401 });

  const [self] = await base44.asServiceRole.entities.User.filter({ id: user.id });
  if (!probeAllowed(self?.role)) return Response.json({ error: 'Solo plataforma', code: 'forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  if (body?.action !== 'probeProvisioning') return Response.json({ error: 'unknown action', code: 'unknown_action' }, { status: 400 });

  const token = Deno.env.get('BASE44_SOMMEL_TOKEN');
  const appId = Deno.env.get('BASE44_APP_ID') ?? '6ab41c2a89f592a0eca074d2';
  if (!token) return Response.json({ error: 'Falta BASE44_SOMMEL_TOKEN', code: 'not_configured' }, { status: 503 });

  try {
    return Response.json(await probe(appId, token));
  } catch (e) {
    console.error('terminals.probeProvisioning failed', (e as Error).message);
    return Response.json({ error: 'internal_error', code: 'internal_error' }, { status: 500 });
  }
}

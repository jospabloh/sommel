import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import {
  canRevoke,
  cleanDeviceId,
  cleanDeviceName,
  effectiveStatus,
  heartbeatDecision,
  heartbeatPatch,
  isRevoked,
  pickSessionSurvivor,
  planManage,
  revokePatchFor,
  sortByLastSeenDesc,
  toPublicSession,
  type Caller,
} from './_session_logic.ts';

// `session` endpoint (module 20, layers 1 and 2). Sessions are per user, not
// per bar, so this does NOT use the tenant guard: a person with no bar yet
// (right after registering) still has a session, and answering 403 no_tenant
// would make the client treat it as a revoked session and log them out.
// For the same reason there is no billing gate: a suspended bar's people must
// still be able to sign in and read why. Writes go through the service role;
// the entity's own rules keep end users from touching AppSession directly.
//
// Actions: manageSession, sessionHeartbeat (403 session_revoked), revokeSession,
// listSessions, trackActivity. Flat records; 401 without a session; the caller
// is always re-read from the stored User row (module 22), never from auth.me().

class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

function fail(status: number, code: string, message: string): never {
  throw new HttpError(status, code, message);
}

async function identify(req: Request) {
  const base44 = createClientFromRequest(req);
  let user: any;
  try {
    user = await base44.auth.me();
  } catch {
    user = null;
  }
  if (!user?.id) fail(401, 'unauthenticated', 'Inicia sesión para continuar');
  const svc = base44.asServiceRole;
  const [self] = await svc.entities.User.filter({ id: user.id });
  if (!self) fail(401, 'unauthenticated', 'Usuario no encontrado');
  const caller: Caller = {
    id: self.id,
    tenantId: self.tenant_id ?? null,
    appRole: self.app_role ?? null,
    isPlatform: self.role === 'admin',
  };
  return { svc, self, caller };
}

type Svc = Awaited<ReturnType<typeof identify>>['svc'];

async function userSessions(svc: Svc, userId: string): Promise<any[]> {
  return await svc.entities.AppSession.filter({ user_id: userId });
}

const publicSelf = (s: any) => ({ id: s.id, status: effectiveStatus(s), device_name: s.device_name || s.device, last_seen: s.last_seen });

async function manageSession(req: Request, body: any): Promise<object> {
  const { svc, self } = await identify(req);
  const deviceId = cleanDeviceId(body?.device_id);
  if (!deviceId) fail(400, 'invalid_device', 'Falta el identificador del dispositivo');
  const deviceName = cleanDeviceName(body?.device_name);
  const nowIso = new Date().toISOString();

  const rows = await userSessions(svc, self.id);
  const plan = planManage(rows, deviceId);
  for (const id of plan.demoteIds) await svc.entities.AppSession.update(id, { status: 'passive' });

  let session: any;
  if (plan.existingId) {
    session = await svc.entities.AppSession.update(plan.existingId, {
      status: 'active',
      device_name: deviceName,
      device: deviceName,
      last_seen: nowIso,
      last_active_at: nowIso,
    });
  } else {
    session = await svc.entities.AppSession.create({
      user_id: self.id,
      user_email: self.email,
      user_name: String(self.display_name ?? '').trim() || self.full_name || null,
      device_id: deviceId,
      device_name: deviceName,
      device: deviceName,
      status: 'active',
      started_at: nowIso,
      last_seen: nowIso,
      last_active_at: nowIso,
    });
    // A double mount can race two creates for one device. Re-read and keep one
    // deterministic survivor; every concurrent caller converges on the same row.
    const again = (await userSessions(svc, self.id)).filter((s) => s.device_id === deviceId && !isRevoked(s));
    const survivor = pickSessionSurvivor(again);
    if (survivor && survivor.id !== session.id) {
      try { await svc.entities.AppSession.delete(session.id); } catch { /* the other request removed it */ }
      session = survivor;
    }
  }
  return { session: publicSelf(session) };
}

async function sessionHeartbeat(req: Request, body: any): Promise<object> {
  const { svc, self } = await identify(req);
  const id = typeof body?.session_id === 'string' ? body.session_id : '';
  const [row] = id ? await svc.entities.AppSession.filter({ id }) : [];
  const decision = heartbeatDecision(row, self.id);
  if (decision === 'not_found') fail(404, 'not_found', 'No encontrado');
  if (decision === 'revoked') fail(403, 'session_revoked', 'Tu sesión fue cerrada');
  await svc.entities.AppSession.update(row.id, heartbeatPatch(new Date().toISOString()));
  return { status: effectiveStatus(row) };
}

async function revokeSession(req: Request, body: any): Promise<object> {
  const { svc, self, caller } = await identify(req);
  const id = typeof body?.session_id === 'string' ? body.session_id : '';
  const [row] = id ? await svc.entities.AppSession.filter({ id }) : [];
  let targetTenant: string | null = null;
  if (row?.user_id && row.user_id !== caller.id) {
    const [target] = await svc.entities.User.filter({ id: row.user_id });
    targetTenant = target?.tenant_id ?? null;
  }
  if (!canRevoke(caller, row, targetTenant)) fail(404, 'not_found', 'No encontrado');
  if (!isRevoked(row)) {
    await svc.entities.AppSession.update(row.id, revokePatchFor(new Date().toISOString(), self.email));
  }
  return { session_id: row.id, status: 'revoked', own: row.user_id === caller.id };
}

async function listSessions(req: Request, body: any): Promise<object> {
  const { svc, self, caller } = await identify(req);
  const deviceId = cleanDeviceId(body?.device_id);
  const scope = body?.scope === 'bar' ? 'bar' : 'mine';

  if (scope === 'mine') {
    const rows = (await userSessions(svc, self.id)).filter((s) => !isRevoked(s));
    return { sessions: sortByLastSeenDesc(rows).map((s) => toPublicSession(s, deviceId)) };
  }

  if (!(caller.appRole === 'bar_admin' && caller.tenantId) && !caller.isPlatform) {
    fail(403, 'forbidden', 'No tienes permiso para esta acción');
  }
  if (!caller.tenantId) fail(404, 'not_found', 'No se encontró el bar');
  // Terminal accounts are managed from Ajustes > Terminales: revoking their
  // session here would sign the device out and leave the terminal half alive.
  const members = (await svc.entities.User.filter({ tenant_id: caller.tenantId })).filter((m: any) => m.app_role !== 'terminal');
  const rows: any[] = [];
  for (const m of members.slice(0, 100)) {
    for (const s of await userSessions(svc, m.id)) if (!isRevoked(s)) rows.push(s);
  }
  return { sessions: sortByLastSeenDesc(rows).slice(0, 200).map((s) => toPublicSession(s, deviceId, { withUser: true })) };
}

async function trackActivity(req: Request): Promise<object> {
  const { svc, self } = await identify(req);
  const live = (await userSessions(svc, self.id)).filter((s) => !isRevoked(s) && effectiveStatus(s) === 'active');
  const [latest] = sortByLastSeenDesc(live);
  if (latest) await svc.entities.AppSession.update(latest.id, { last_active_at: new Date().toISOString() });
  return {};
}

const ROUTES: Record<string, (req: Request, body: any) => Promise<object>> = {
  manageSession,
  sessionHeartbeat,
  revokeSession,
  listSessions,
  trackActivity,
};

export default async function (req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') fail(405, 'method_not_allowed', 'Método no permitido');
    let body: any;
    try {
      body = await req.json();
    } catch {
      fail(400, 'invalid_body', 'Cuerpo inválido');
    }
    const action = body?.action;
    const route = typeof action === 'string' && Object.prototype.hasOwnProperty.call(ROUTES, action) ? ROUTES[action] : undefined;
    if (!route) fail(400, 'unknown_action', 'Acción no válida');
    return Response.json({ ok: true, ...(await route(req, body)) });
  } catch (error) {
    if (error instanceof HttpError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error('session failed', (error as Error).message);
    return Response.json({ error: 'Error interno', code: 'internal_error' }, { status: 500 });
  }
}

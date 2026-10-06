// Manager approval from the phone (QR + Face ID / fingerprint), 2026-10-06.
//
// 1. Once per phone, an admin registers it: passkeyRegisterOptions gives a
//    challenge, the phone creates a passkey, passkeyRegister verifies and
//    stores the PUBLIC key.
// 2. At the terminal, staff asks for approval: createApprovalRequest returns
//    an id the dialog shows as a QR; the terminal polls approvalRequestStatus.
// 3. The admin scans it, opens /aprobar/<id> on their phone (getApprovalRequest)
//    and confirms with Face ID: decideApprovalRequest verifies the signature
//    against the admin's stored key and marks it approved.
// 4. The terminal repeats the action with `approval: { request_id }`;
//    requireApproval (orders/payments/shifts) consumes it once.
import { httpError, HttpError, personName, remoteOnly, type Ctx, type Route } from '../_guard.ts';
import { APPROVAL_LABELS, type ApprovalAction } from '../_approval_logic.ts';
import {
  PasskeyError,
  REQUEST_TTL_MS,
  RP_ID,
  RP_NAME,
  b64urlEncode,
  randomChallenge,
  requestStatus,
  verifyAssertion,
  verifyRegistration,
} from '../_passkey_logic.ts';

const MAX_PASSKEYS_PER_ADMIN = 5;

function requireAdmin(ctx: Ctx): string {
  if (!ctx.tenantId || ctx.appRole !== 'bar_admin') httpError(403, 'forbidden', 'Solo un administrador del bar puede hacer esto');
  return ctx.tenantId as string;
}

function requireMember(ctx: Ctx): string {
  if (!ctx.tenantId) httpError(403, 'no_tenant', 'No perteneces a ningún bar');
  return ctx.tenantId as string;
}

async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof PasskeyError) throw new HttpError(400, err.code, err.message);
    throw err;
  }
}

function str(value: unknown, max = 4096): string {
  return typeof value === 'string' && value.length <= max ? value : '';
}

async function loadRequest(ctx: Ctx, id: unknown, tenantId: string): Promise<any> {
  const requestId = str(id, 64);
  const [row] = requestId ? await ctx.svc.entities.ApprovalRequest.filter({ id: requestId }) : [];
  // Missing and another bar's answer the same (no existence oracle).
  if (!row || row.tenant_id !== tenantId) httpError(404, 'not_found', 'No se encontró la solicitud');
  return row;
}

// ---- 1. Register a phone ----

export const passkeyRegisterOptions: Route = remoteOnly(async (ctx: Ctx) => {
  const tenantId = requireAdmin(ctx);
  const nowMs = Date.now();
  const mine = await ctx.svc.entities.Passkey.filter({ tenant_id: tenantId, user_id: ctx.self.id });
  if (mine.length >= MAX_PASSKEYS_PER_ADMIN) {
    httpError(409, 'too_many_passkeys', `Ya tienes ${MAX_PASSKEYS_PER_ADMIN} celulares registrados. Quita uno antes`);
  }
  const challenge = randomChallenge();
  const row = await ctx.svc.entities.ApprovalRequest.create({
    tenant_id: tenantId,
    kind: 'register',
    action: null,
    label: 'Registrar celular',
    challenge,
    status: 'pending',
    requested_by_id: ctx.self.id,
    requested_by_name: personName(ctx.self),
    created_at: new Date(nowMs).toISOString(),
    expires_at: new Date(nowMs + REQUEST_TTL_MS).toISOString(),
  });
  return {
    request_id: row.id,
    options: {
      challenge,
      rp: { id: RP_ID, name: RP_NAME },
      user: { id: b64urlEncode(new TextEncoder().encode(ctx.self.id)), name: ctx.self.email ?? personName(ctx.self), displayName: personName(ctx.self) },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
      attestation: 'none',
      timeout: REQUEST_TTL_MS,
      excludeCredentials: mine.map((p: any) => ({ type: 'public-key', id: p.credential_id })),
    },
  };
});

export const passkeyRegister: Route = remoteOnly(async (ctx: Ctx, body: any) => {
  const tenantId = requireAdmin(ctx);
  const row = await loadRequest(ctx, body?.request_id, tenantId);
  if (row.kind !== 'register' || row.requested_by_id !== ctx.self.id) httpError(404, 'not_found', 'No se encontró la solicitud');
  if (requestStatus(row, Date.now()) !== 'pending') httpError(409, 'request_closed', 'El registro caducó. Vuelve a intentarlo');
  const reg = await run(() =>
    verifyRegistration({
      attestationObject: str(body?.credential?.response?.attestationObject, 16384),
      clientDataJSON: str(body?.credential?.response?.clientDataJSON),
      challenge: row.challenge,
    })
  );
  await ctx.svc.entities.ApprovalRequest.update(row.id, { status: 'used', used_at: new Date().toISOString() });
  const [dupe] = await ctx.svc.entities.Passkey.filter({ tenant_id: tenantId, credential_id: reg.credentialId });
  if (dupe) httpError(409, 'already_registered', 'Este celular ya estaba registrado');
  const label = (str(body?.label, 60).trim() || 'Celular').slice(0, 60);
  const created = await ctx.svc.entities.Passkey.create({
    tenant_id: tenantId,
    user_id: ctx.self.id,
    credential_id: reg.credentialId,
    public_key_jwk: reg.publicKeyJwk,
    sign_count: reg.signCount,
    label,
    created_at: new Date().toISOString(),
    last_used_at: null,
  });
  return { passkey: { id: created.id, label, created_at: created.created_at } };
});

export const passkeyList: Route = remoteOnly(async (ctx: Ctx) => {
  const tenantId = requireAdmin(ctx);
  const mine = await ctx.svc.entities.Passkey.filter({ tenant_id: tenantId, user_id: ctx.self.id });
  return { passkeys: mine.map((p: any) => ({ id: p.id, label: p.label ?? 'Celular', created_at: p.created_at, last_used_at: p.last_used_at ?? null })) };
});

export const passkeyDelete: Route = remoteOnly(async (ctx: Ctx, body: any) => {
  const tenantId = requireAdmin(ctx);
  const id = str(body?.passkey_id, 64);
  const [row] = id ? await ctx.svc.entities.Passkey.filter({ id }) : [];
  // Only your own phones.
  if (!row || row.tenant_id !== tenantId || row.user_id !== ctx.self.id) httpError(404, 'not_found', 'No se encontró ese celular');
  await ctx.svc.entities.Passkey.delete(row.id);
  return { deleted: true };
});

// ---- 2. The terminal asks ----

export const createApprovalRequest: Route = async (ctx: Ctx, body: any) => {
  const tenantId = requireMember(ctx);
  if (ctx.bar?.approval_qr_enabled !== true) httpError(409, 'qr_disabled', 'La aprobación desde el celular está apagada en este bar');
  // Not `action`: that field is the router's (callFn sends { action: 'createApprovalRequest', ... }).
  const action = str(body?.approval_action, 40) as ApprovalAction;
  if (!Object.prototype.hasOwnProperty.call(APPROVAL_LABELS, action)) httpError(400, 'invalid_action', 'Acción no válida');
  const nowMs = Date.now();
  const row = await ctx.svc.entities.ApprovalRequest.create({
    tenant_id: tenantId,
    kind: 'approve',
    action,
    label: APPROVAL_LABELS[action],
    challenge: randomChallenge(),
    status: 'pending',
    requested_by_id: ctx.self.id,
    requested_by_name: personName(ctx.self),
    terminal_id: ctx.terminal?.device?.id ?? null,
    created_at: new Date(nowMs).toISOString(),
    expires_at: new Date(nowMs + REQUEST_TTL_MS).toISOString(),
  });
  return { request_id: row.id, expires_at: row.expires_at };
};

export const approvalRequestStatus: Route = async (ctx: Ctx, body: any) => {
  const tenantId = requireMember(ctx);
  const row = await loadRequest(ctx, body?.request_id, tenantId);
  if (row.requested_by_id !== ctx.self.id) httpError(404, 'not_found', 'No se encontró la solicitud');
  return { status: requestStatus(row, Date.now()), approved_by_name: row.approved_by_name ?? null };
};

export const cancelApprovalRequest: Route = async (ctx: Ctx, body: any) => {
  const tenantId = requireMember(ctx);
  const row = await loadRequest(ctx, body?.request_id, tenantId);
  if (row.requested_by_id !== ctx.self.id) httpError(404, 'not_found', 'No se encontró la solicitud');
  if (row.status === 'pending') await ctx.svc.entities.ApprovalRequest.update(row.id, { status: 'cancelled' });
  return { cancelled: true };
};

// ---- 3. The admin decides on the phone ----

export const getApprovalRequest: Route = remoteOnly(async (ctx: Ctx, body: any) => {
  const tenantId = requireAdmin(ctx);
  const row = await loadRequest(ctx, body?.request_id, tenantId);
  if (row.kind !== 'approve') httpError(404, 'not_found', 'No se encontró la solicitud');
  const mine = await ctx.svc.entities.Passkey.filter({ tenant_id: tenantId, user_id: ctx.self.id });
  return {
    request: {
      id: row.id,
      label: row.label,
      requested_by_name: row.requested_by_name ?? '',
      created_at: row.created_at,
      expires_at: row.expires_at,
      status: requestStatus(row, Date.now()),
      self_request: row.requested_by_id === ctx.self.id,
    },
    challenge: row.challenge,
    rp_id: RP_ID,
    credential_ids: mine.map((p: any) => p.credential_id),
  };
});

export const decideApprovalRequest: Route = remoteOnly(async (ctx: Ctx, body: any) => {
  const tenantId = requireAdmin(ctx);
  const row = await loadRequest(ctx, body?.request_id, tenantId);
  if (row.kind !== 'approve') httpError(404, 'not_found', 'No se encontró la solicitud');
  if (row.requested_by_id === ctx.self.id) httpError(403, 'self_approval', 'Nadie se aprueba a sí mismo');
  if (requestStatus(row, Date.now()) !== 'pending') httpError(409, 'request_closed', 'Esta solicitud ya no está pendiente');
  const nowIso = new Date().toISOString();
  const me = { approved_by_id: ctx.self.id, approved_by_name: personName(ctx.self), decided_at: nowIso };

  if (body?.approve !== true) {
    await ctx.svc.entities.ApprovalRequest.update(row.id, { status: 'rejected', ...me });
    return { status: 'rejected' };
  }

  // Approving needs the admin's own phone key and Face ID / fingerprint.
  const credentialId = str(body?.credential?.id, 1024);
  const [key] = credentialId
    ? await ctx.svc.entities.Passkey.filter({ tenant_id: tenantId, user_id: ctx.self.id, credential_id: credentialId })
    : [];
  if (!key) httpError(403, 'unknown_passkey', 'Este celular no está registrado para aprobar. Regístralo primero');
  const res = body.credential.response ?? {};
  const { signCount } = await run(() =>
    verifyAssertion({
      publicKeyJwk: key.public_key_jwk,
      storedSignCount: key.sign_count ?? 0,
      authenticatorData: str(res.authenticatorData),
      clientDataJSON: str(res.clientDataJSON),
      signature: str(res.signature),
      challenge: row.challenge,
    })
  );
  await ctx.svc.entities.Passkey.update(key.id, { sign_count: signCount, last_used_at: nowIso });
  await ctx.svc.entities.ApprovalRequest.update(row.id, { status: 'approved', ...me });
  return { status: 'approved' };
});

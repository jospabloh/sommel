// Calls to the Base44 platform API for terminal accounts (both beta APIs:
// users/provisions and embed-url). Authenticated with BASE44_SOMMEL_TOKEN,
// the platform owner's personal access token scoped to Sommel (the account has no
// workspace API keys). Proven by terminals.probeProvisioning on 2026-10-06:
// host app.base44.com, `Authorization: Bearer`. The token never leaves here.
import { accessTokenFromLocation } from './_terminal_logic.ts';

const PLATFORM_HOST = 'https://app.base44.com';
const APP_HOST = 'https://base44.app';

function appId(): string {
  return Deno.env.get('BASE44_APP_ID') ?? '6ab41c2a89f592a0eca074d2';
}

function token(): string {
  const t = Deno.env.get('BASE44_SOMMEL_TOKEN');
  if (!t) throw new PlatformError('not_configured', 'Falta configurar las terminales (BASE44_SOMMEL_TOKEN)');
  return t;
}

export class PlatformError extends Error {
  constructor(public code: string, message: string, public status = 0) {
    super(message);
  }
}

async function call(method: string, path: string, body: unknown): Promise<any> {
  const res = await fetch(`${PLATFORM_HOST}/api/apps/${appId()}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new PlatformError('platform_error', `Base44 respondió ${res.status} en ${path}`, res.status);
  return data;
}

export async function provisionAccount(email: string, fullName: string): Promise<string> {
  const r = await call('POST', '/users/provisions', { email, role: 'user', full_name: fullName });
  return String(r?.status ?? '');
}

export async function deprovisionAccount(email: string): Promise<boolean> {
  try {
    await call('DELETE', '/users/provisions', { email });
    return true;
  } catch {
    return false;
  }
}

// Base44 renamed this beta endpoint: /embed-tokens answered 404 on 2026-10-06
// and the catalog now lists /embed-url (same body and response). Try the
// current name first and fall back to the old one only on a 404.
const SIGN_IN_PATHS = ['/embed-url', '/embed-tokens'];

async function mintSignIn(email: string): Promise<any> {
  let last: unknown = null;
  for (const path of SIGN_IN_PATHS) {
    try {
      return await call('POST', path, { email, target: 'live_site' });
    } catch (err) {
      if (!(err instanceof PlatformError) || err.status !== 404) throw err;
      last = err;
    }
  }
  throw last;
}

/** Mints the one-time sign-in and spends it server side; returns the session. */
export async function signInAs(email: string): Promise<string> {
  const minted = await mintSignIn(email);
  if (!minted?.embed_url) throw new PlatformError('platform_error', 'Base44 no devolvió el enlace de inicio de sesión');
  const landing = await fetch(minted.embed_url, { redirect: 'manual' });
  const session = accessTokenFromLocation(landing.headers.get('location'));
  if (!session) throw new PlatformError('platform_error', 'Base44 no devolvió la sesión de la terminal');
  return session;
}

/** The User row id behind a session (creates the app user on first use). */
export async function userIdOf(session: string): Promise<string> {
  const res = await fetch(`${APP_HOST}/api/apps/${appId()}/entities/User/me`, {
    headers: { Authorization: `Bearer ${session}` },
  });
  const me = await res.json().catch(() => ({}));
  if (!res.ok || typeof me?.id !== 'string') throw new PlatformError('platform_error', 'No se pudo leer la cuenta de la terminal');
  return me.id;
}

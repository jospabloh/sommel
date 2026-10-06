// Pure helpers for terminals.probeProvisioning. Import-free so
// base44/tests/terminals_probe_test.ts runs them in the sandbox.

/** Fixed throwaway identity: the probe never touches a real person. */
export const PROBE_EMAIL = 'terminal-probe@terminales.acaciaco.com.mx';

/** Hosts and header shapes to try, in order. The docs only describe workspace
 *  API keys, so which one a personal token needs is what the probe finds out. */
export const HOSTS = ['https://app.base44.com', 'https://base44.app'];
export const AUTH_SHAPES = ['bearer', 'api_key'] as const;
export type AuthShape = typeof AUTH_SHAPES[number];

export function authHeaders(shape: AuthShape, token: string): Record<string, string> {
  return shape === 'bearer' ? { Authorization: `Bearer ${token}` } : { api_key: token };
}

/** Only the platform owner may run the probe; the role comes from the
 *  freshly re-read User row, never from auth.me(). */
export function probeAllowed(selfRole: unknown): boolean {
  return selfRole === 'admin';
}

/** Does a redirect Location carry a session, without returning its value. */
export function locationHasAccessToken(location: string | null): boolean {
  if (!location) return false;
  try {
    return new URL(location, 'https://x.invalid').searchParams.has('access_token');
  } catch {
    return false;
  }
}

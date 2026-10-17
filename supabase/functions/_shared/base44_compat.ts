// Stand-in for `npm:@base44/sdk` on Supabase (docs/migracion-supabase.md §3.3).
// `npm run generate:supabase-functions` copies every Base44 function here and
// rewrites its one SDK import to this file, so `_guard.ts` and the handlers run
// unchanged: same `auth.me()`, same `asServiceRole.entities`, same
// `integrations.Core.SendEmail`.
//
// - `auth.me()` validates the caller's Supabase JWT (the `Authorization:
//   Bearer` header) and throws when it is missing or invalid; the guard turns
//   that into 401 `unauthenticated`, as on Base44.
// - `asServiceRole.entities` is the `entities` shim over a service-key client:
//   it bypasses RLS, exactly like Base44's service role. The guard is what
//   scopes every read and write to the caller's bar.
// - Email is not wired until phase 4 (Resend): SendEmail throws, and every
//   handler that sends mail already treats a failure as `email_sent: false`.
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { compatClient, type AdminClient } from './compat.ts';

let admin: AdminClient | null = null;

// Tests run the generated functions against an in-memory PostgREST.
export function setAdminClientForTests(client: AdminClient | null): void {
  admin = client;
}

function adminClient(): AdminClient {
  if (admin) return admin;
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing');
  admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) as unknown as AdminClient;
  return admin;
}

// Same name and signature as the Base44 SDK export.
// deno-lint-ignore no-explicit-any
export function createClientFromRequest(req: Request): any {
  return compatClient(adminClient(), req);
}

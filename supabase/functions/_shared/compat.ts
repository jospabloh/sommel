// Pure half of base44_compat.ts: the client a Base44 handler sees, built
// from a supabase-js admin client passed in. No external imports, so tests
// drive it with a fake client offline.
import { createEntities, type SupabaseLike } from './entities.ts';

type AuthUser = { id: string; email?: string | null; user_metadata?: Record<string, unknown> | null };
export type AuthLike = { getUser(jwt: string): Promise<{ data: { user: AuthUser | null }; error: unknown }> };
export type AdminClient = SupabaseLike & { auth: SupabaseLike['auth'] & AuthLike };

export function bearerToken(req: Request): string | null {
  const h = req.headers.get('Authorization') ?? '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

export const integrations = {
  Core: {
    SendEmail(_args: { to: string; subject: string; body: string; from_name?: string }): Promise<never> {
      console.warn('email_not_configured: SendEmail is not wired on Supabase until phase 4');
      return Promise.reject(new Error('email_not_configured'));
    },
  },
};

// The client a handler sees, built from an admin client (tests pass a fake).
export function compatClient(admin: AdminClient, req: Request) {
  const service = { entities: createEntities(admin), integrations };
  return {
    auth: {
      async me() {
        const token = bearerToken(req);
        if (!token) throw new Error('Authentication required');
        const { data, error } = await admin.auth.getUser(token);
        if (error || !data?.user) throw new Error('Authentication required');
        const u = data.user;
        return { id: u.id, email: u.email ?? null, full_name: (u.user_metadata?.full_name as string | undefined) ?? null };
      },
    },
    asServiceRole: service,
    integrations,
  };
}


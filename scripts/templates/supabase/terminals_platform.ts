// Supabase stand-in for base44/functions/terminals/_platform.ts, written over
// it by `npm run generate:supabase-functions`. The Base44 file provisions
// accounts through Base44's platform API (BASE44_SOMMEL_TOKEN); on Supabase
// terminals and people without email come in phase 4, with
// auth.admin.createUser (docs/migracion-supabase.md §3.4). Until then every
// call answers `not_ported`, and nothing here can ever reach Base44.
// Same exports and signatures as the Base44 file.

export class PlatformError extends Error {
  constructor(public code: string, message: string, public status = 0) {
    super(message);
  }
}

const notPorted = (): never => {
  throw new PlatformError('not_ported', 'Las terminales todavía no funcionan en Supabase (fase 4)', 501);
};

export async function provisionAccount(_email: string, _fullName: string): Promise<string> {
  return await Promise.resolve(notPorted());
}
export async function deprovisionAccount(_email: string): Promise<boolean> {
  return await Promise.resolve(notPorted());
}
export async function signInAs(_email: string): Promise<string> {
  return await Promise.resolve(notPorted());
}
export async function userIdOf(_session: string): Promise<string> {
  return await Promise.resolve(notPorted());
}

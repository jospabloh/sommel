// Stand-in for npm:@supabase/supabase-js, used ONLY by
// `npm run check:supabase-functions`, so the generated Edge Functions compile
// offline like the Base44 ones do against sdk-stub.ts.
// deno-lint-ignore-file no-explicit-any
export const createClient = (_url: string, _key: string, _options?: any): any => ({}) as any;

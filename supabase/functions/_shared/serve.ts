// Turns a Base44 function (`export default function (req) => Response`) into a
// Supabase Edge Function. Base44 answered CORS for us; here the browser's
// preflight and the CORS headers on every response are ours.
//
// Origins: the production domain and local dev. A preview domain gets added
// here on purpose (phase 3), never `*`: the functions take a bearer token, and
// a wildcard would let any site call them with a stolen one.

const ALLOWED_ORIGINS = new Set([
  'https://sommel.acaciaco.com.mx',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

export function corsHeaders(origin: string | null): Record<string, string> {
  const h: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    Vary: 'Origin',
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

export function withCors(handler: (req: Request) => Promise<Response> | Response) {
  return async (req: Request): Promise<Response> => {
    const cors = corsHeaders(req.headers.get('Origin'));
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const res = await handler(req);
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(cors)) headers.set(k, v);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  };
}

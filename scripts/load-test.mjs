// Load test against the PUBLISHED app (2026-10-06). Read-only: each user
// alternates stations.getConfig and an OrderItem.filter, at RATE req/s for
// SECONDS, all users in parallel; everyone stops at the first 429.
//
// Base44's limit is shared by the WHOLE APP (all bars), so a 429 here is also
// felt by real bars for a few seconds. Run it only when told to, never with
// the account José is testing with, and wait ~90 s between runs.
//
//   LOAD_USERS="a@x.com:pw,b@x.com:pw" RATE=3.5 SECONDS=120 node scripts/load-test.mjs
import { createClient } from '@base44/sdk';
import { readFileSync } from 'node:fs';

const APP = JSON.parse(readFileSync(new URL('../base44.app.json', import.meta.url))).appId;
const RATE = Number(process.env.RATE || 2);
const SECONDS = Number(process.env.SECONDS || 30);
const users = String(process.env.LOAD_USERS || '').split(',').filter(Boolean).map((u) => {
  const i = u.indexOf(':');
  return [u.slice(0, i), u.slice(i + 1)];
});
if (users.length === 0) throw new Error('LOAD_USERS="correo:contraseña,..." is required');

const pct = (a, p) => (a.length ? a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * a.length))] : 0);
let stop = false;

async function run([email, pw]) {
  const c = createClient({ appId: APP, requiresAuth: false });
  const r = await c.auth.loginViaEmailPassword(email, pw);
  c.auth.setToken(r.access_token);
  const me = await c.auth.me();
  const ops = [
    () => c.functions.invoke('stations', { action: 'getConfig' }),
    () => c.entities.OrderItem.filter({ tenant_id: me.tenant_id, status: { $in: ['enviado', 'listo'] } }),
  ];
  const lat = [], errs = {}, inflight = [];
  let n = 0, firstLimitAt = null;
  const t = Date.now();
  while (Date.now() - t < SECONDS * 1000 && !stop) {
    const f = ops[n++ % ops.length];
    const t0 = Date.now();
    inflight.push(f().then(() => lat.push(Date.now() - t0)).catch((e) => {
      const s = e?.status ?? e?.response?.status ?? 0;
      errs[s] = (errs[s] || 0) + 1;
      if (s === 429 && !stop) { stop = true; firstLimitAt = ((Date.now() - t) / 1000).toFixed(1); }
    }));
    await new Promise((res) => setTimeout(res, 1000 / RATE));
  }
  await Promise.all(inflight);
  return { user: email, sent: n, ok: lat.length, p50_ms: pct(lat, 0.5), p95_ms: pct(lat, 0.95), errors: errs, first_429_after_s: firstLimitAt };
}

console.log(JSON.stringify(await Promise.all(users.map(run)), null, 2));

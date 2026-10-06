// Manager approval from the phone: passkey (WebAuthn) verification. The test
// plays the phone with a real P-256 key, so a bug in CBOR, COSE, DER or the
// signed bytes fails here instead of at the bar. Each test names the attack it
// stops.
import {
  RP_ID,
  b64urlDecode,
  b64urlEncode,
  cborDecode,
  derToRaw,
  requestStatus,
  verifyAssertion,
  verifyRegistration,
} from '../functions/security/_passkey_logic.ts';
import { phoneApprovalProblem, parseApproval } from '../../scripts/templates/_approval_logic.ts';

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg ?? 'assertEquals'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
async function assertRejects(fn: () => Promise<unknown>, code: string) {
  try {
    await fn();
  } catch (err) {
    if ((err as { code?: string }).code === code) return;
    throw new Error(`expected ${code}, got ${(err as { code?: string }).code ?? (err as Error).message}`);
  }
  throw new Error(`expected ${code}, but it passed`);
}

// ---- a tiny CBOR encoder, enough to play the phone ----
function head(major: number, n: number): number[] {
  if (n < 24) return [(major << 5) | n];
  if (n < 256) return [(major << 5) | 24, n];
  return [(major << 5) | 25, n >> 8, n & 255];
}
function cbor(v: unknown): number[] {
  if (typeof v === 'number') return v >= 0 ? head(0, v) : head(1, -1 - v);
  if (typeof v === 'string') { const b = [...new TextEncoder().encode(v)]; return [...head(3, b.length), ...b]; }
  if (v instanceof Uint8Array) return [...head(2, v.length), ...v];
  if (v instanceof Map) { const out = head(5, v.size); for (const [k, x] of v) out.push(...cbor(k), ...cbor(x)); return out; }
  throw new Error('unsupported');
}
function rawToDer(raw: Uint8Array): Uint8Array {
  const int = (b: Uint8Array) => {
    let i = 0;
    while (i < b.length - 1 && b[i] === 0) i++;
    let v = [...b.slice(i)];
    if (v[0] & 0x80) v = [0, ...v];
    return [0x02, v.length, ...v];
  };
  const body = [...int(raw.slice(0, 32)), ...int(raw.slice(32))];
  return new Uint8Array([0x30, body.length, ...body]);
}
async function sha(b: Uint8Array) { return new Uint8Array(await crypto.subtle.digest('SHA-256', b as Uint8Array<ArrayBuffer>)); }

const ORIGIN = 'https://sommel.acaciaco.com.mx';

async function makePhone(rpId = RP_ID) {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const credId = crypto.getRandomValues(new Uint8Array(16));
  const cose = new Map<unknown, unknown>([[1, 2], [3, -7], [-1, 1], [-2, b64urlDecode(jwk.x!)], [-3, b64urlDecode(jwk.y!)]]);
  const rpHash = await sha(new TextEncoder().encode(rpId));
  const authData = (flags: number, count: number, attested: boolean) => {
    const out = [...rpHash, flags, (count >>> 24) & 255, (count >> 16) & 255, (count >> 8) & 255, count & 255];
    if (attested) out.push(...new Array(16).fill(0), 0, credId.length, ...credId, ...cbor(cose));
    return new Uint8Array(out);
  };
  const clientData = (type: string, challenge: string, origin = ORIGIN) =>
    new TextEncoder().encode(JSON.stringify({ type, challenge, origin, crossOrigin: false }));
  return {
    credentialId: b64urlEncode(credId),
    register(challenge: string, opts: { flags?: number; origin?: string } = {}) {
      const att = new Map<unknown, unknown>([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData(opts.flags ?? 0x45, 0, true)]]);
      return {
        attestationObject: b64urlEncode(new Uint8Array(cbor(att))),
        clientDataJSON: b64urlEncode(clientData('webauthn.create', challenge, opts.origin)),
        challenge,
      };
    },
    async sign(challenge: string, opts: { flags?: number; count?: number; origin?: string; type?: string } = {}) {
      const ad = authData(opts.flags ?? 0x05, opts.count ?? 0, false);
      const cd = clientData(opts.type ?? 'webauthn.get', challenge, opts.origin);
      const signed = new Uint8Array([...ad, ...(await sha(cd))]);
      const raw = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, signed));
      return { authenticatorData: b64urlEncode(ad), clientDataJSON: b64urlEncode(cd), signature: b64urlEncode(rawToDer(raw)), challenge };
    },
  };
}

Deno.test('a real phone registers and then approves with its key', async () => {
  const phone = await makePhone();
  const reg = await verifyRegistration(phone.register('reto-registro'));
  assertEquals(reg.credentialId, phone.credentialId);
  const res = await verifyAssertion({ publicKeyJwk: reg.publicKeyJwk, storedSignCount: 0, ...(await phone.sign('reto-aprobar')) });
  assertEquals(res.signCount, 0);
});

Deno.test('a signature for another request (old QR, other challenge) is refused', async () => {
  const phone = await makePhone();
  const reg = await verifyRegistration(phone.register('r'));
  const signed = await phone.sign('reto-viejo');
  await assertRejects(() => verifyAssertion({ publicKeyJwk: reg.publicKeyJwk, storedSignCount: 0, ...signed, challenge: 'reto-nuevo' }), 'challenge_mismatch');
});

Deno.test('another phone (another key) cannot approve as the admin', async () => {
  const admin = await makePhone();
  const intruder = await makePhone();
  const reg = await verifyRegistration(admin.register('r'));
  await assertRejects(async () => verifyAssertion({ publicKeyJwk: reg.publicKeyJwk, storedSignCount: 0, ...(await intruder.sign('x')) }), 'bad_signature');
});

Deno.test('without Face ID / fingerprint (user not verified) nothing is approved or registered', async () => {
  const phone = await makePhone();
  await assertRejects(() => verifyRegistration(phone.register('r', { flags: 0x41 })), 'not_verified');
  const reg = await verifyRegistration(phone.register('r'));
  await assertRejects(async () => verifyAssertion({ publicKeyJwk: reg.publicKeyJwk, storedSignCount: 0, ...(await phone.sign('x', { flags: 0x01 })) }), 'not_verified');
});

Deno.test('a phishing site (other origin or other rpId) is refused', async () => {
  const phone = await makePhone();
  await assertRejects(() => verifyRegistration(phone.register('r', { origin: 'https://sommel-falso.com' })), 'bad_origin');
  const other = await makePhone('otro-sitio.com');
  await assertRejects(() => verifyRegistration(other.register('r')), 'bad_rp');
});

Deno.test('a registration response cannot be replayed as an approval', async () => {
  const phone = await makePhone();
  const reg = await verifyRegistration(phone.register('r'));
  await assertRejects(async () => verifyAssertion({ publicKeyJwk: reg.publicKeyJwk, storedSignCount: 0, ...(await phone.sign('x', { type: 'webauthn.create' })) }), 'bad_client_data');
});

Deno.test('a counter that goes backwards (cloned key) is refused; 0 means the phone does not count', async () => {
  const phone = await makePhone();
  const reg = await verifyRegistration(phone.register('r'));
  await assertRejects(async () => verifyAssertion({ publicKeyJwk: reg.publicKeyJwk, storedSignCount: 10, ...(await phone.sign('x', { count: 9 })) }), 'counter_replay');
  assertEquals((await verifyAssertion({ publicKeyJwk: reg.publicKeyJwk, storedSignCount: 10, ...(await phone.sign('x', { count: 11 })) })).signCount, 11);
  assertEquals((await verifyAssertion({ publicKeyJwk: reg.publicKeyJwk, storedSignCount: 10, ...(await phone.sign('x', { count: 0 })) })).signCount, 0);
});

Deno.test('malformed data never throws anything but a PasskeyError', async () => {
  for (const bad of ['', '!!!', 'AAAA']) {
    try {
      await verifyRegistration({ attestationObject: bad, clientDataJSON: bad, challenge: 'x' });
      throw new Error('passed');
    } catch (err) {
      if (!(err as { code?: string }).code) throw err;
    }
  }
  try { derToRaw(new Uint8Array([1, 2, 3])); throw new Error('passed'); } catch (err) { if (!(err as { code?: string }).code) throw err; }
  assertEquals(cborDecode(new Uint8Array(cbor(new Map([['a', 1]])))) instanceof Map, true);
});

Deno.test('a pending request expires; the status the terminal sees', () => {
  const now = Date.parse('2026-10-06T22:00:00Z');
  assertEquals(requestStatus({ status: 'pending', expires_at: new Date(now + 1000).toISOString() }, now), 'pending');
  assertEquals(requestStatus({ status: 'pending', expires_at: new Date(now - 1).toISOString() }, now), 'expired');
  assertEquals(requestStatus({ status: 'approved', expires_at: new Date(now - 1).toISOString() }, now), 'approved');
  assertEquals(requestStatus(null, now), 'missing');
});

Deno.test('a phone approval is single use, for this bar, this action and this requester', () => {
  const now = Date.parse('2026-10-06T22:00:00Z');
  const ok = { tenant_id: 'bar', kind: 'approve', action: 'void_payment', requested_by_id: 's1', status: 'approved', decided_at: new Date(now - 5000).toISOString() };
  const opts = { tenantId: 'bar', action: 'void_payment' as const, requesterId: 's1', nowMs: now };
  assertEquals(phoneApprovalProblem(ok, opts), null);
  assertEquals(phoneApprovalProblem({ ...ok, status: 'used' }, opts), 'approval_used');
  assertEquals(phoneApprovalProblem({ ...ok, status: 'pending' }, opts), 'approval_not_approved');
  assertEquals(phoneApprovalProblem({ ...ok, status: 'rejected' }, opts), 'approval_not_approved');
  assertEquals(phoneApprovalProblem({ ...ok, tenant_id: 'otro' }, opts), 'approval_not_found');
  assertEquals(phoneApprovalProblem({ ...ok, kind: 'register' }, opts), 'approval_not_found');
  assertEquals(phoneApprovalProblem({ ...ok, action: 'cash_out' }, opts), 'approval_mismatch', 'approved a withdrawal, used for a void');
  assertEquals(phoneApprovalProblem({ ...ok, requested_by_id: 's2' }, opts), 'approval_mismatch', 'someone else’s approval');
  assertEquals(phoneApprovalProblem({ ...ok, decided_at: new Date(now - 3 * 60_000).toISOString() }, opts), 'approval_expired');
  assertEquals(phoneApprovalProblem(null, opts), 'approval_not_found');
});

Deno.test('the client may send a phone approval id instead of a PIN', () => {
  assertEquals(parseApproval({ request_id: 'abc123' }), { method: 'passkey', requestId: 'abc123' });
  assertEquals(parseApproval({ request_id: 'a b' }), null);
});

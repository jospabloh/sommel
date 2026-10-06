// Passkeys (WebAuthn) for manager approval from the phone: Face ID, Touch ID
// or fingerprint. No imports (WebCrypto is global) so Deno tests load it in
// the sandbox. Only ES256 (P-256) keys, the one every phone platform
// authenticator offers. Attestation is not checked on purpose: registration
// happens from the admin's own signed-in session, which is what we trust.

/** The only site where passkeys are created and used. */
export const RP_ID = 'sommel.acaciaco.com.mx';
export const RP_NAME = 'Sommel';
export const ALLOWED_ORIGINS = ['https://sommel.acaciaco.com.mx'];
/** How long a QR (and its challenge) stays valid. */
export const REQUEST_TTL_MS = 3 * 60_000;

export class PasskeyError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

// ---- base64url ----

export function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(text: string): Uint8Array<ArrayBuffer> {
  if (typeof text !== 'string' || !/^[A-Za-z0-9_-]*$/.test(text)) throw new PasskeyError('bad_encoding', 'Datos de la llave mal formados');
  const pad = text.length % 4 === 0 ? '' : '='.repeat(4 - (text.length % 4));
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomChallenge(): string {
  return b64urlEncode(crypto.getRandomValues(new Uint8Array(32)));
}

// ---- minimal CBOR (what WebAuthn uses: ints, bytes, text, arrays, maps, simple) ----

/** Decodes the first CBOR item of `bytes`; trailing bytes are ignored. */
export function cborDecode(bytes: Uint8Array): unknown {
  let pos = 0;
  const need = (n: number) => {
    if (pos + n > bytes.length) throw new PasskeyError('bad_cbor', 'Datos de la llave incompletos');
  };
  const readLength = (info: number): number => {
    if (info < 24) return info;
    if (info === 24) { need(1); return bytes[pos++]; }
    if (info === 25) { need(2); const v = (bytes[pos] << 8) | bytes[pos + 1]; pos += 2; return v; }
    if (info === 26) { need(4); const v = ((bytes[pos] << 24) >>> 0) + (bytes[pos + 1] << 16) + (bytes[pos + 2] << 8) + bytes[pos + 3]; pos += 4; return v; }
    throw new PasskeyError('bad_cbor', 'Formato de llave no soportado');
  };
  const item = (depth: number): unknown => {
    if (depth > 8) throw new PasskeyError('bad_cbor', 'Datos de la llave demasiado anidados');
    need(1);
    const first = bytes[pos++];
    const major = first >> 5;
    const info = first & 31;
    switch (major) {
      case 0: return readLength(info);
      case 1: return -1 - readLength(info);
      case 2: { const n = readLength(info); need(n); const v = bytes.slice(pos, pos + n); pos += n; return v; }
      case 3: { const n = readLength(info); need(n); const v = new TextDecoder().decode(bytes.slice(pos, pos + n)); pos += n; return v; }
      case 4: { const n = readLength(info); const arr: unknown[] = []; for (let i = 0; i < n; i++) arr.push(item(depth + 1)); return arr; }
      case 5: {
        const n = readLength(info);
        const map = new Map<unknown, unknown>();
        for (let i = 0; i < n; i++) { const k = item(depth + 1); map.set(k, item(depth + 1)); }
        return map;
      }
      case 7:
        if (info === 20) return false;
        if (info === 21) return true;
        if (info === 22) return null;
        throw new PasskeyError('bad_cbor', 'Formato de llave no soportado');
      default:
        throw new PasskeyError('bad_cbor', 'Formato de llave no soportado');
    }
  };
  return item(0);
}

// ---- authenticator data ----

export interface AuthData {
  rpIdHash: Uint8Array;
  userPresent: boolean;
  userVerified: boolean;
  signCount: number;
  credentialId?: Uint8Array;
  coseKey?: Map<unknown, unknown>;
}

export function parseAuthData(bytes: Uint8Array): AuthData {
  if (bytes.length < 37) throw new PasskeyError('bad_auth_data', 'Respuesta del celular incompleta');
  const flags = bytes[32];
  const signCount = ((bytes[33] << 24) >>> 0) + (bytes[34] << 16) + (bytes[35] << 8) + bytes[36];
  const out: AuthData = {
    rpIdHash: bytes.slice(0, 32),
    userPresent: (flags & 0x01) !== 0,
    userVerified: (flags & 0x04) !== 0,
    signCount,
  };
  if (flags & 0x40) {
    if (bytes.length < 55) throw new PasskeyError('bad_auth_data', 'Respuesta del celular incompleta');
    const idLen = (bytes[53] << 8) | bytes[54];
    if (bytes.length < 55 + idLen) throw new PasskeyError('bad_auth_data', 'Respuesta del celular incompleta');
    out.credentialId = bytes.slice(55, 55 + idLen);
    // cborDecode reads the first item and ignores what follows (extensions).
    const value = cborDecode(bytes.slice(55 + idLen));
    if (!(value instanceof Map)) throw new PasskeyError('bad_key', 'La llave del celular no es válida');
    out.coseKey = value;
  }
  return out;
}

/** COSE EC2 P-256 / ES256 key to a JWK WebCrypto can import. */
export function coseToJwk(cose: Map<unknown, unknown>): JsonWebKey {
  const kty = cose.get(1);
  const alg = cose.get(3);
  const crv = cose.get(-1);
  const x = cose.get(-2);
  const y = cose.get(-3);
  if (kty !== 2 || alg !== -7 || crv !== 1 || !(x instanceof Uint8Array) || !(y instanceof Uint8Array) || x.length !== 32 || y.length !== 32) {
    throw new PasskeyError('unsupported_key', 'Este celular usa un tipo de llave que Sommel no admite');
  }
  return { kty: 'EC', crv: 'P-256', x: b64urlEncode(x), y: b64urlEncode(y), ext: true };
}

/** ECDSA signature from WebAuthn (DER) to the raw r||s WebCrypto verifies. */
export function derToRaw(der: Uint8Array): Uint8Array<ArrayBuffer> {
  if (der.length < 8 || der[0] !== 0x30) throw new PasskeyError('bad_signature', 'Firma del celular mal formada');
  let pos = 2;
  if (der[1] & 0x80) pos = 2 + (der[1] & 0x7f);
  const readInt = (): Uint8Array => {
    if (der[pos] !== 0x02) throw new PasskeyError('bad_signature', 'Firma del celular mal formada');
    const len = der[pos + 1];
    let v = der.slice(pos + 2, pos + 2 + len);
    pos += 2 + len;
    while (v.length > 32 && v[0] === 0) v = v.slice(1);
    if (v.length > 32) throw new PasskeyError('bad_signature', 'Firma del celular mal formada');
    const padded = new Uint8Array(32);
    padded.set(v, 32 - v.length);
    return padded;
  };
  const r = readInt();
  const s = readInt();
  const out = new Uint8Array(new ArrayBuffer(64));
  out.set(r, 0);
  out.set(s, 32);
  return out;
}

async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Checks clientDataJSON: right ceremony, right challenge, right site. */
export function checkClientData(
  clientDataJSON: Uint8Array,
  opts: { type: 'webauthn.create' | 'webauthn.get'; challenge: string; origins?: string[] }
): void {
  let data: any;
  try {
    data = JSON.parse(new TextDecoder().decode(clientDataJSON));
  } catch {
    throw new PasskeyError('bad_client_data', 'Respuesta del celular mal formada');
  }
  if (data?.type !== opts.type) throw new PasskeyError('bad_client_data', 'Respuesta del celular no corresponde');
  if (data?.challenge !== opts.challenge) throw new PasskeyError('challenge_mismatch', 'Este código ya no es válido. Genera uno nuevo');
  if (!(opts.origins ?? ALLOWED_ORIGINS).includes(data?.origin)) {
    throw new PasskeyError('bad_origin', 'Abre Sommel desde sommel.acaciaco.com.mx para aprobar');
  }
}

async function checkRpId(authData: AuthData, rpId: string): Promise<void> {
  const expected = await sha256(new TextEncoder().encode(rpId) as Uint8Array<ArrayBuffer>);
  if (!sameBytes(authData.rpIdHash, expected)) throw new PasskeyError('bad_rp', 'La llave es de otro sitio');
}

/** Verifies a registration (navigator.credentials.create) and returns what to store. */
export async function verifyRegistration(input: {
  attestationObject: string;
  clientDataJSON: string;
  challenge: string;
  rpId?: string;
  origins?: string[];
}): Promise<{ credentialId: string; publicKeyJwk: JsonWebKey; signCount: number }> {
  const clientData = b64urlDecode(input.clientDataJSON);
  checkClientData(clientData, { type: 'webauthn.create', challenge: input.challenge, origins: input.origins });
  const att = cborDecode(b64urlDecode(input.attestationObject));
  if (!(att instanceof Map) || !(att.get('authData') instanceof Uint8Array)) {
    throw new PasskeyError('bad_attestation', 'Respuesta del celular mal formada');
  }
  const authData = parseAuthData(att.get('authData') as Uint8Array);
  await checkRpId(authData, input.rpId ?? RP_ID);
  if (!authData.userPresent || !authData.userVerified) {
    throw new PasskeyError('not_verified', 'El celular no confirmó con Face ID, huella o su código');
  }
  if (!authData.credentialId || !authData.coseKey) throw new PasskeyError('bad_attestation', 'El celular no envió su llave');
  return { credentialId: b64urlEncode(authData.credentialId), publicKeyJwk: coseToJwk(authData.coseKey), signCount: authData.signCount };
}

/** Verifies an approval (navigator.credentials.get) against a stored key. Returns the new sign count. */
export async function verifyAssertion(input: {
  publicKeyJwk: JsonWebKey;
  storedSignCount: number;
  authenticatorData: string;
  clientDataJSON: string;
  signature: string;
  challenge: string;
  rpId?: string;
  origins?: string[];
}): Promise<{ signCount: number }> {
  const clientData = b64urlDecode(input.clientDataJSON);
  checkClientData(clientData, { type: 'webauthn.get', challenge: input.challenge, origins: input.origins });
  const authBytes = b64urlDecode(input.authenticatorData);
  const authData = parseAuthData(authBytes);
  await checkRpId(authData, input.rpId ?? RP_ID);
  if (!authData.userPresent || !authData.userVerified) {
    throw new PasskeyError('not_verified', 'El celular no confirmó con Face ID, huella o su código');
  }
  // A counter that goes backwards means a cloned key. 0 means the
  // authenticator does not count (iCloud Keychain, Google Password Manager).
  if (authData.signCount !== 0 && input.storedSignCount !== 0 && authData.signCount <= input.storedSignCount) {
    throw new PasskeyError('counter_replay', 'La llave del celular parece copiada. Regístrala de nuevo');
  }
  const signed = new Uint8Array(new ArrayBuffer(authBytes.length + 32));
  signed.set(authBytes, 0);
  signed.set(await sha256(clientData), authBytes.length);
  const key = await crypto.subtle.importKey('jwk', input.publicKeyJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, derToRaw(b64urlDecode(input.signature)), signed);
  if (!ok) throw new PasskeyError('bad_signature', 'La firma del celular no es válida');
  return { signCount: authData.signCount };
}

/** Status the requester sees while waiting at the terminal. */
export function requestStatus(row: { status?: string; expires_at?: string } | null | undefined, nowMs: number): string {
  if (!row) return 'missing';
  if (row.status === 'pending' && Date.parse(row.expires_at ?? '') <= nowMs) return 'expired';
  return row.status ?? 'missing';
}

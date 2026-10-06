// Same file as attendance/handlers/_pin.ts (Deno functions cannot import across
// directories); base44/tests/terminals_logic_test.ts fails if they drift.
// PIN hashing for the checador. WebCrypto only, ZERO imports, so `deno test`
// loads it offline. PBKDF2-SHA256, 100 000 iterations, 16-byte random salt
// per row, everything hex-encoded (contract section 1, StaffPin).

export const PIN_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  if (typeof hex !== 'string' || hex.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(hex)) {
    throw new Error('invalid hex');
  }
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function derive(pin: string, salt: Uint8Array<ArrayBuffer>): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PIN_ITERATIONS },
    key,
    HASH_BYTES * 8
  );
  return toHex(new Uint8Array(bits));
}

/** Hashes a PIN with a fresh random salt. */
export async function hashPin(pin: string): Promise<{ salt: string; pin_hash: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(SALT_BYTES)));
  return { salt: toHex(salt), pin_hash: await derive(pin, salt) };
}

/** Constant-time string comparison (does not stop at the first difference). */
export function constantTimeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/** True when `pin` hashes to `pinHash` with the stored salt. Never throws on bad stored data. */
export async function verifyPin(pin: string, saltHex: string, pinHash: string): Promise<boolean> {
  try {
    const computed = await derive(String(pin), fromHex(saltHex));
    return constantTimeEqual(computed, String(pinHash ?? ''));
  } catch {
    return false;
  }
}

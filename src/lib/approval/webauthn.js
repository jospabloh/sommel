// WebAuthn plumbing for manager approval from the phone: the server speaks
// base64url, the browser API speaks ArrayBuffers. No imports (tested in Deno).

export function b64urlToBuf(text) {
  const pad = text.length % 4 === 0 ? '' : '='.repeat(4 - (text.length % 4));
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

export function bufToB64url(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Whether this browser can use a phone's Face ID / fingerprint passkey at all. */
export function passkeysSupported() {
  return typeof window !== 'undefined' && !!window.PublicKeyCredential && !!navigator.credentials?.create;
}

/** Server options (passkeyRegisterOptions) to what navigator.credentials.create wants. */
export function toCreateOptions(o) {
  return {
    ...o,
    challenge: b64urlToBuf(o.challenge),
    user: { ...o.user, id: b64urlToBuf(o.user.id) },
    excludeCredentials: (o.excludeCredentials || []).map((c) => ({ ...c, id: b64urlToBuf(c.id) })),
  };
}

/** What navigator.credentials.get wants to approve one request. */
export function toGetOptions({ challenge, rp_id, credential_ids }) {
  return {
    challenge: b64urlToBuf(challenge),
    rpId: rp_id,
    allowCredentials: (credential_ids || []).map((id) => ({ type: 'public-key', id: b64urlToBuf(id) })),
    userVerification: 'required',
    timeout: 120000,
  };
}

export function registrationToJSON(cred) {
  return {
    id: cred.id,
    type: cred.type,
    response: {
      attestationObject: bufToB64url(cred.response.attestationObject),
      clientDataJSON: bufToB64url(cred.response.clientDataJSON),
    },
  };
}

export function assertionToJSON(cred) {
  return {
    id: cred.id,
    type: cred.type,
    response: {
      authenticatorData: bufToB64url(cred.response.authenticatorData),
      clientDataJSON: bufToB64url(cred.response.clientDataJSON),
      signature: bufToB64url(cred.response.signature),
    },
  };
}

/** Spanish text for what the browser throws (cancelled, timed out, wrong site). */
export function webauthnErrorText(err) {
  const name = err?.name || '';
  if (name === 'NotAllowedError') return 'Se canceló o se agotó el tiempo. Vuelve a intentarlo.';
  if (name === 'InvalidStateError') return 'Este celular ya está registrado.';
  if (name === 'SecurityError') return 'Abre Sommel desde sommel.acaciaco.com.mx para usar Face ID o huella.';
  if (name === 'NotSupportedError') return 'Este navegador no permite Face ID ni huella para Sommel.';
  return err?.message || 'No se pudo usar Face ID ni huella.';
}

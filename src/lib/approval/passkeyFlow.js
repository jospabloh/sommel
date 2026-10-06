// Registers this phone's passkey (Face ID / fingerprint) for manager approval.
import { callFn } from '@/lib/api';
import { registrationToJSON, toCreateOptions } from './webauthn';

export async function registerThisPhone(label) {
  const { request_id, options } = await callFn('security', 'passkeyRegisterOptions');
  const cred = await navigator.credentials.create({ publicKey: toCreateOptions(options) });
  return callFn('security', 'passkeyRegister', { request_id, credential: registrationToJSON(cred), label });
}

// Idempotency key of one payment attempt (contrato entrega 2, seccion 6,
// Cobro): generated ONCE per attempt and reused on every retry of that same
// attempt, so a timeout followed by a second tap can never charge twice.
// It is regenerated after a success or when the amount or method changes
// (a different payment). `received` is deliberately not part of the
// signature: correcting the cash handed over must still reuse the key.
import { useCallback, useRef } from 'react';

function newKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function useAttemptKey() {
  const ref = useRef({ sig: null, key: null });

  /** Returns the key for this signature, creating one when the signature is new. */
  const keyFor = useCallback((orderId, method, amount) => {
    const sig = `${orderId}|${method}|${amount}`;
    if (ref.current.sig !== sig || !ref.current.key) {
      ref.current = { sig, key: newKey() };
    }
    return ref.current.key;
  }, []);

  /** Call after a successful payment so the next one starts a new attempt. */
  const reset = useCallback(() => {
    ref.current = { sig: null, key: null };
  }, []);

  return { keyFor, reset };
}

// Thin wrapper over base44.functions.invoke (contract §1/§5):
// `base44.functions.invoke('<endpoint>', { action, ...payload })` and the
// server answers `{ ok: true, ... }` or an HTTP error with
// `{ error: '<mensaje en español>', code: '<snake_case>' }`.
//
// `callFn` is the ONE place in `src/` that talks to
// `base44.functions.invoke` for these endpoints, so every page gets the same
// error shape (`ApiError`) instead of each page re-parsing
// `err.response?.data?.error` by hand.
import { base44 } from '@/api/base44Client';
import { currentPass, lockTerminal, markRevoked } from '@/lib/terminal/terminalStore';
import { isRateLimited, isRetryableRead, retryDelay } from '@/lib/retryPolicy';
import { APPROVAL_RETRY_CODES, askForApproval, wantsApproval } from '@/lib/approval/approvalBroker';

export class ApiError extends Error {
  /**
   * @param {number} status
   * @param {string} code
   * @param {string} message
   * @param {object} [data] - Full error body, so structured fields the
   *   server's `HttpError.extra` adds (e.g. `{ order_id }` on 409
   *   table_busy — contract §4, fixed 2026-09-28) reach the caller instead
   *   of only the message text.
   */
  constructor(status, code, message, data) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.data = data ?? {};
  }
}

/**
 * @param {string} endpoint - Nombre de la función (p.ej. 'catalog', 'orders', 'stations').
 * @param {string} action - Acción del router del contrato §4.
 * @param {object} [payload] - Resto del cuerpo, junto a `action`.
 * @returns {Promise<object>} El cuerpo `{ ok: true, ... }` de la respuesta.
 * @throws {ApiError}
 */
export async function callFn(endpoint, action, payload = {}) {
  try {
    return await callWithRetry(endpoint, action, payload);
  } catch (err) {
    if (!(err instanceof ApiError) || !wantsApproval(err.code, payload)) throw err;
    return await callWithApproval(endpoint, action, payload, err);
  }
}

// Manager approval: the server refused before writing anything, so the same
// call is repeated with the admin's PIN until it passes or the person cancels.
async function callWithApproval(endpoint, action, payload, first) {
  const label = first.data?.approval_label || first.message;
  const approvalAction = first.data?.approval_action || null;
  let approval = await askForApproval({ label, action: approvalAction, error: null });
  while (approval) {
    try {
      return await callWithRetry(endpoint, action, { ...payload, approval });
    } catch (err) {
      if (!(err instanceof ApiError) || !APPROVAL_RETRY_CODES.has(err.code)) throw err;
      approval = await askForApproval({ label, action: approvalAction, error: err.message });
    }
  }
  throw new ApiError(403, 'approval_cancelled', 'Se canceló la aprobación', null);
}

async function callWithRetry(endpoint, action, payload) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await callOnce(endpoint, action, payload);
    } catch (err) {
      // Base44's rate limit: reads wait a moment and try again; writes never.
      const wait = err instanceof ApiError && isRateLimited(err.status, err.code) && isRetryableRead(endpoint, action)
        ? retryDelay(attempt)
        : null;
      if (wait === null) throw err;
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
}

async function callOnce(endpoint, action, payload) {
  try {
    // Terminal mode: the person who unlocked this terminal travels with every
    // call; the server checks it and acts as that person.
    const pass = currentPass();
    const res = await base44.functions.invoke(endpoint, { action, ...payload, ...(pass ? { terminal_pass: pass } : {}) });
    return res?.data ?? {};
  } catch (err) {
    const status = err?.response?.status ?? 0;
    const data = err?.response?.data;
    const code = data?.code || 'unknown_error';
    if (code === 'terminal_locked') lockTerminal();
    if (code === 'terminal_revoked') markRevoked();
    const message = data?.error || err?.message || 'Error de red';
    throw new ApiError(status, code, message, data);
  }
}

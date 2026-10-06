// Manager approval, client side. `callFn` asks here when the server answers
// 403 `approval_required`; the ApprovalProvider mounted in Layout answers by
// opening the PIN dialog. No imports (tested in Deno).

let handler = null;

/** The provider registers how to ask. Returns the unregister function. */
export function setApprovalHandler(fn) {
  handler = fn;
  return () => {
    if (handler === fn) handler = null;
  };
}

/** Resolves to `{ approver_id, pin }` or `{ request_id }` (approved from a
 *  phone), or null when nobody can answer or it was cancelled. */
export function askForApproval(info) {
  return handler ? Promise.resolve(handler(info)) : Promise.resolve(null);
}

/** Errors after which the dialog asks again (nothing was written: the server checks approval first). */
export const APPROVAL_RETRY_CODES = new Set([
  'approval_wrong_pin',
  'pin_locked',
  'approver_no_pin',
  'approver_invalid',
  // Phone approvals: used, expired, for another action, or not approved yet.
  'approval_used',
  'approval_expired',
  'approval_mismatch',
  'approval_not_found',
  'approval_not_approved',
]);

/** Whether a failed call is the server asking for approval (and we did not already send one). */
export function wantsApproval(code, payload) {
  return code === 'approval_required' && !(payload && payload.approval);
}

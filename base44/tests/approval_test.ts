// Manager approval (2026-10-06). José decided: four actions (cancel a sent
// line, void a payment, cash out, close the shift) and only the bar's admins
// approve, with their PIN. Each test says what would go wrong without it.
import * as logic from '../../scripts/templates/_approval_logic.ts';
import * as ordersCopy from '../functions/orders/_approval_logic.ts';
import * as attendancePin from '../functions/attendance/handlers/_pin.ts';
import * as paymentsPin from '../functions/payments/_pin.ts';
import { APPROVAL_RETRY_CODES, askForApproval, setApprovalHandler, wantsApproval } from '../../src/lib/approval/approvalBroker.js';
import { isRetryableRead } from '../../src/lib/retryPolicy.js';

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg ?? 'assertEquals'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const NOW = Date.parse('2026-10-06T22:00:00Z');

Deno.test('exactly the four actions José chose need approval', () => {
  assertEquals(Object.keys(logic.APPROVAL_LABELS).sort(), ['cancel_sent_item', 'cash_out', 'close_shift', 'void_payment']);
});

Deno.test('staff must ask; an admin or the platform acts alone', () => {
  assertEquals(logic.needsApproval('staff', false), true);
  assertEquals(logic.needsApproval(null, false), true, 'unknown role asks, never skips');
  assertEquals(logic.needsApproval('bar_admin', false), false);
  assertEquals(logic.needsApproval('staff', true), false);
});

Deno.test('only an admin of THIS bar approves, never a staff member, a terminal or the requester', () => {
  const admin = { id: 'a1', tenant_id: 'bar', app_role: 'bar_admin' };
  assertEquals(logic.isApprover(admin, 'bar', 's1'), true);
  assertEquals(logic.isApprover({ ...admin, tenant_id: 'otro' }, 'bar', 's1'), false, 'admin of another bar');
  assertEquals(logic.isApprover({ ...admin, app_role: 'staff' }, 'bar', 's1'), false);
  assertEquals(logic.isApprover({ ...admin, app_role: 'terminal' }, 'bar', 's1'), false);
  assertEquals(logic.isApprover(admin, 'bar', 'a1'), false, 'nobody approves themselves');
  assertEquals(logic.isApprover(null, 'bar', 's1'), false);
  assertEquals(logic.isApprover(admin, null, 's1'), false);
});

Deno.test('a malformed approval is the same as none (the server answers approval_required)', () => {
  assertEquals(logic.parseApproval({ approver_id: 'a1', pin: '1234' }), { approverId: 'a1', pin: '1234' });
  assertEquals(logic.parseApproval({ approver_id: 'a1', pin: '12' }), null);
  assertEquals(logic.parseApproval({ approver_id: 'a1', pin: 1234 }), null);
  assertEquals(logic.parseApproval({ pin: '1234' }), null);
  assertEquals(logic.parseApproval('a1:1234'), null);
  assertEquals(logic.parseApproval(null), null);
});

Deno.test('the admin PIN locks after 5 misses for 15 minutes, like the checador', () => {
  let state = { failed_attempts: 0, locked_until: null as string | null };
  for (let i = 0; i < 4; i++) {
    state = logic.registerFailure(state.failed_attempts, NOW);
    assertEquals(state.locked_until, null);
  }
  state = logic.registerFailure(state.failed_attempts, NOW);
  assertEquals(logic.lockMinutesLeft(state.locked_until, NOW), 15);
  assertEquals(logic.lockMinutesLeft(state.locked_until, NOW + 15 * 60_000), 0);
});

Deno.test('a PIN made at the checador verifies in the approval copy', async () => {
  const { salt, pin_hash } = await attendancePin.hashPin('3691');
  assertEquals(await paymentsPin.verifyPin('3691', salt, pin_hash), true);
  assertEquals(await paymentsPin.verifyPin('3692', salt, pin_hash), false);
});

Deno.test('the approval logic the functions run is the template', () => {
  assertEquals(Object.keys(ordersCopy).sort(), Object.keys(logic).sort());
});

Deno.test('the dialog lists admins of the bar, on shift first, never the requester', () => {
  const users = [
    { id: 'a1', tenant_id: 'bar', app_role: 'bar_admin', display_name: 'Zoe' },
    { id: 'a2', tenant_id: 'bar', app_role: 'bar_admin', display_name: 'Ana' },
    { id: 'a3', tenant_id: 'bar', app_role: 'bar_admin', display_name: 'Beto' },
    { id: 's1', tenant_id: 'bar', app_role: 'staff', display_name: 'Mesero' },
    { id: 'x1', tenant_id: 'otro', app_role: 'bar_admin', display_name: 'Ajeno' },
  ];
  const list = logic.approverList(users, {
    tenantId: 'bar', requesterId: 'a3', withPin: new Set(['a1', 'a2']), onShift: new Set(['a1']), nameOf: (u) => u.display_name,
  });
  assertEquals(list, [
    { id: 'a1', name: 'Zoe', on_shift: true, has_pin: true },
    { id: 'a2', name: 'Ana', on_shift: false, has_pin: true },
  ]);
});

Deno.test('the client asks only on approval_required and never re-sends an approval in a loop', () => {
  assertEquals(wantsApproval('approval_required', {}), true);
  assertEquals(wantsApproval('approval_required', { approval: { approver_id: 'a', pin: '1234' } }), false);
  assertEquals(wantsApproval('forbidden', {}), false);
  for (const c of ['approval_wrong_pin', 'pin_locked', 'approver_no_pin', 'approver_invalid']) assertEquals(APPROVAL_RETRY_CODES.has(c), true);
  assertEquals(APPROVAL_RETRY_CODES.has('read_only'), false);
});

Deno.test('with no dialog mounted, asking resolves to null (the action is cancelled, not stuck)', async () => {
  assertEquals(await askForApproval({ label: 'x' }), null);
  const off = setApprovalHandler(() => ({ approver_id: 'a1', pin: '1234' }));
  assertEquals(await askForApproval({ label: 'x' }), { approver_id: 'a1', pin: '1234' });
  off();
  assertEquals(await askForApproval({ label: 'x' }), null);
});

Deno.test('the four gated actions are writes and are never retried on a 429', () => {
  for (const [e, a] of [['orders', 'cancelItem'], ['payments', 'voidPayment'], ['shifts', 'addCashOut'], ['shifts', 'close']]) {
    assertEquals(isRetryableRead(e, a), false, `${e}.${a}`);
  }
});

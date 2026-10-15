// A twin line neutralised by orders.addItems (a retried batch written twice) is
// bookkeeping, not a cancellation: it must not show in the cancellations report
// nor in the corte's cancelled count. The marker is the one addItems.ts writes.
import { isSystemDuplicate } from '../functions/reports/handlers/_logic.ts';
import { countsAsCancelled } from '../functions/shifts/handlers/_cancelled_logic.ts';

const assert = (c: unknown, m: string) => { if (!c) throw new Error(m); };
const dup = { status: 'cancelado', cancel_reason: 'duplicado', cancelled_by: 'sistema' };
const real = { status: 'cancelado', cancel_reason: 'duplicado', cancelled_by: 'ana@bar.mx' };

Deno.test('a system-neutralised twin is not a cancellation', () => {
  assert(isSystemDuplicate(dup), 'report should skip the twin');
  assert(!countsAsCancelled(dup), 'corte should skip the twin');
});

Deno.test('a person cancelling with the word duplicado still counts', () => {
  assert(!isSystemDuplicate(real), 'a human cancellation is never hidden');
  assert(countsAsCancelled(real), 'corte counts a human cancellation');
  assert(!countsAsCancelled({ status: 'enviado' }), 'live lines never count');
});


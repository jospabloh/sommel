// Deno tests for base44/functions/printing/handlers/_logic.ts (zero imports in
// the file under test, so this runs with deno.land/jsr.io blocked).
//
//   deno test --allow-env base44/tests/printing_logic_test.ts
import {
  CLAIM_STALE_MS,
  LogicError,
  assertReprintable,
  assertRetryable,
  decideMark,
  didWinClaim,
  isClaimStale,
  isClaimable,
  isVisibleFailure,
  nextReprintKey,
  normalizeError,
  orderQueue,
  pickNextClaimable,
  reprintTitle,
  validateDeviceId,
} from '../functions/printing/handlers/_logic.ts';

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(msg || `expected ${e}, got ${a}`);
}

function assertCode(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (e) {
    if (!(e instanceof LogicError)) throw new Error('expected a LogicError');
    if (e.code !== code) throw new Error(`expected code ${code}, got ${e.code}`);
    return;
  }
  throw new Error('expected function to throw');
}

const NOW = Date.parse('2026-09-28T18:00:00.000Z');
const ago = (msAgo: number) => new Date(NOW - msAgo).toISOString();

Deno.test('isClaimStale: only a reclamado job older than 2 minutes', () => {
  assertEquals(isClaimStale({ status: 'reclamado', claimed_at: ago(CLAIM_STALE_MS - 1000) }, NOW), false);
  assertEquals(isClaimStale({ status: 'reclamado', claimed_at: ago(CLAIM_STALE_MS + 1000) }, NOW), true);
  assertEquals(isClaimStale({ status: 'pendiente', claimed_at: ago(CLAIM_STALE_MS + 1000) }, NOW), false);
  assertEquals(isClaimStale({ status: 'impreso', claimed_at: ago(CLAIM_STALE_MS + 1000) }, NOW), false);
});

Deno.test('isClaimStale: a claim with no readable timestamp counts as stale', () => {
  assertEquals(isClaimStale({ status: 'reclamado' }, NOW), true);
  assertEquals(isClaimStale({ status: 'reclamado', claimed_at: 'nope' }, NOW), true);
});

Deno.test('isClaimable: pendiente, or stale reclamado; never impreso, fallido or fresh reclamado', () => {
  assertEquals(isClaimable({ status: 'pendiente' }, NOW), true);
  assertEquals(isClaimable({ status: 'reclamado', claimed_at: ago(200000) }, NOW), true);
  assertEquals(isClaimable({ status: 'reclamado', claimed_at: ago(1000) }, NOW), false);
  assertEquals(isClaimable({ status: 'impreso' }, NOW), false);
  assertEquals(isClaimable({ status: 'fallido' }, NOW), false);
});

Deno.test('pickNextClaimable: oldest claimable first, id as tiebreak', () => {
  const jobs = [
    { id: 'c', status: 'pendiente', created_date: ago(1000) },
    { id: 'a', status: 'pendiente', created_date: ago(5000) },
    { id: 'b', status: 'pendiente', created_date: ago(5000) },
    { id: 'z', status: 'fallido', created_date: ago(90000) },
    { id: 'y', status: 'reclamado', claimed_at: ago(1000), created_date: ago(80000) },
  ];
  assertEquals(pickNextClaimable(jobs, NOW)?.id, 'a');
});

Deno.test('pickNextClaimable: a stale claim older than every pendiente is picked first', () => {
  const jobs = [
    { id: 'p', status: 'pendiente', created_date: ago(1000) },
    { id: 's', status: 'reclamado', claimed_at: ago(300000), created_date: ago(400000) },
  ];
  assertEquals(pickNextClaimable(jobs, NOW)?.id, 's');
});

Deno.test('pickNextClaimable: nothing claimable gives null', () => {
  assertEquals(pickNextClaimable([], NOW), null);
  assertEquals(pickNextClaimable([{ id: 'x', status: 'impreso' }], NOW), null);
});

Deno.test('didWinClaim: the re-read row must name this device', () => {
  assertEquals(didWinClaim({ status: 'reclamado', claimed_by: 'dev-1' }, 'dev-1'), true);
  assertEquals(didWinClaim({ status: 'reclamado', claimed_by: 'dev-2' }, 'dev-1'), false);
  assertEquals(didWinClaim({ status: 'impreso', claimed_by: 'dev-1' }, 'dev-1'), false);
  assertEquals(didWinClaim(null, 'dev-1'), false);
});

Deno.test('validateDeviceId: trims, rejects empty and oversized', () => {
  assertEquals(validateDeviceId('  dev-1 '), 'dev-1');
  assertCode(() => validateDeviceId(''), 'device_required');
  assertCode(() => validateDeviceId(undefined), 'device_required');
  assertCode(() => validateDeviceId('x'.repeat(81)), 'device_invalid');
});

Deno.test('decideMark: only the claiming device closes a reclamado job', () => {
  const job = { status: 'reclamado', claimed_by: 'dev-1' };
  assertEquals(decideMark(job, 'dev-1', 'impreso'), 'apply');
  assertEquals(decideMark(job, 'dev-1', 'fallido'), 'apply');
  assertCode(() => decideMark(job, 'dev-2', 'impreso'), 'claimed_elsewhere');
});

Deno.test('decideMark: repeating the same close from the same device is a no-op', () => {
  assertEquals(decideMark({ status: 'impreso', claimed_by: 'dev-1' }, 'dev-1', 'impreso'), 'noop');
  assertEquals(decideMark({ status: 'fallido', claimed_by: 'dev-1' }, 'dev-1', 'fallido'), 'noop');
});

Deno.test('decideMark: a job that is not claimed cannot be closed', () => {
  assertCode(() => decideMark({ status: 'pendiente' }, 'dev-1', 'impreso'), 'invalid_status');
  assertCode(() => decideMark({ status: 'impreso', claimed_by: 'dev-2' }, 'dev-1', 'impreso'), 'invalid_status');
  // A job printed then marked failed by the same device is a different target.
  assertCode(() => decideMark({ status: 'impreso', claimed_by: 'dev-1' }, 'dev-1', 'fallido'), 'invalid_status');
});

Deno.test('assertRetryable: fallido only, and never a neutralized duplicate', () => {
  assertRetryable({ status: 'fallido', error: 'Sin papel' });
  assertCode(() => assertRetryable({ status: 'impreso' }), 'invalid_status');
  assertCode(() => assertRetryable({ status: 'pendiente' }), 'invalid_status');
  assertCode(() => assertRetryable({ status: 'fallido', error: 'duplicado' }), 'duplicate_job');
});

Deno.test('assertReprintable: impreso or fallido, not in-flight, not a duplicate', () => {
  assertReprintable({ status: 'impreso' });
  assertReprintable({ status: 'fallido', error: 'Sin papel' });
  assertCode(() => assertReprintable({ status: 'pendiente' }), 'invalid_status');
  assertCode(() => assertReprintable({ status: 'reclamado' }), 'invalid_status');
  assertCode(() => assertReprintable({ status: 'fallido', error: 'duplicado' }), 'duplicate_job');
});

Deno.test('nextReprintKey: starts at 1 and continues past the highest used', () => {
  assertEquals(nextReprintKey('j1', []), 'reprint:j1:1');
  assertEquals(nextReprintKey('j1', ['reprint:j1:1', 'reprint:j1:2']), 'reprint:j1:3');
  assertEquals(nextReprintKey('j1', ['reprint:j1:4', 'reprint:j1:2']), 'reprint:j1:5');
  // Other jobs' keys and unrelated keys are ignored.
  assertEquals(nextReprintKey('j1', ['reprint:j2:9', 'ticket:o1:100:100', null, undefined]), 'reprint:j1:1');
});

Deno.test('reprintTitle: prefixes once, falls back to the kind', () => {
  assertEquals(reprintTitle('Ticket Mesa 4', 'ticket'), 'Reimpresión: Ticket Mesa 4');
  assertEquals(reprintTitle('Reimpresión: Ticket Mesa 4', 'ticket'), 'Reimpresión: Ticket Mesa 4');
  assertEquals(reprintTitle('', 'corte'), 'Reimpresión: Trabajo corte');
});

Deno.test('normalizeError: trims, caps at 300, defaults to Spanish text', () => {
  assertEquals(normalizeError('  sin papel '), 'sin papel');
  assertEquals(normalizeError(''), 'Error de impresión');
  assertEquals(normalizeError(42), 'Error de impresión');
  assertEquals(normalizeError('x'.repeat(500)).length, 300);
});

Deno.test('isVisibleFailure and orderQueue: duplicates hidden, waiting before failed, oldest first', () => {
  assertEquals(isVisibleFailure({ status: 'fallido', error: 'duplicado' }), false);
  assertEquals(isVisibleFailure({ status: 'fallido', error: 'Sin papel' }), true);
  assertEquals(isVisibleFailure({ status: 'pendiente' }), false);
  const ordered = orderQueue([
    { id: 'f1', status: 'fallido', created_date: ago(9000) },
    { id: 'p2', status: 'pendiente', created_date: ago(1000) },
    { id: 'p1', status: 'reclamado', created_date: ago(5000) },
  ]);
  assertEquals(ordered.map((j) => j.id), ['p1', 'p2', 'f1']);
});

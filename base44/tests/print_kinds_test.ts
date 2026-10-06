// Printer per job type (2026-10-06): with two printers, each takes only its
// kinds. Each test names what a real bar would see if the rule drifted.
import { PRINT_KINDS, pickNextClaimable, validateKinds } from '../functions/printing/handlers/_logic.ts';
// @ts-ignore: plain JS module, the same file the client imports.
import { CHOOSABLE_KINDS, jobMatchesKinds, kindsForClaim, normalizeKinds } from '../../src/components/printing/printingHelpers.js';

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg ?? 'assertEquals'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function assertThrowsCode(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (err) {
    if ((err as { code?: string }).code === code) return;
    throw err;
  }
  throw new Error(`expected ${code}`);
}

const NOW = Date.parse('2026-10-06T22:00:00Z');
const job = (id: string, kind: string, minutesAgo: number) => ({
  id,
  kind,
  status: 'pendiente',
  created_date: new Date(NOW - minutesAgo * 60_000).toISOString(),
});

Deno.test('the caja printer skips an older comanda and takes the ticket', () => {
  const jobs = [job('c1', 'cocina', 5), job('t1', 'ticket', 1)];
  assertEquals(pickNextClaimable(jobs, NOW, ['ticket', 'corte'])?.id, 't1');
  assertEquals(pickNextClaimable(jobs, NOW, ['cocina', 'cambio'])?.id, 'c1');
  // No choice sent: oldest of anything, exactly as before.
  assertEquals(pickNextClaimable(jobs, NOW)?.id, 'c1');
  assertEquals(pickNextClaimable([job('c1', 'cocina', 5)], NOW, ['ticket']), null);
});

Deno.test('claimNext refuses an empty or unknown kind list instead of printing everything', () => {
  assertEquals(validateKinds(undefined), null);
  assertEquals(validateKinds(['ticket', 'ticket']), ['ticket']);
  assertThrowsCode(() => validateKinds([]), 'kinds_invalid');
  assertThrowsCode(() => validateKinds(['factura']), 'kinds_invalid');
  assertThrowsCode(() => validateKinds('ticket'), 'kinds_invalid');
});

Deno.test('client and server know the same kinds', () => {
  for (const k of CHOOSABLE_KINDS) {
    if (!(PRINT_KINDS as readonly string[]).includes(k)) throw new Error(`${k} unknown to the server`);
  }
});

Deno.test('a device choice: all four or none means "todo"; comanda changes ride with cocina/barra', () => {
  assertEquals(normalizeKinds(['cocina', 'barra', 'ticket', 'corte']), null);
  assertEquals(normalizeKinds([]), null);
  assertEquals(normalizeKinds('x'), null);
  assertEquals(normalizeKinds(['corte', 'ticket', 'nope']), ['ticket', 'corte']);
  assertEquals(kindsForClaim(['cocina']), ['cocina', 'cambio']);
  assertEquals(kindsForClaim(['ticket']), ['ticket']);
  assertEquals(kindsForClaim(null), null);
});

Deno.test('auto print only waits on its own kinds (no endless claimNext for a comanda)', () => {
  assertEquals(jobMatchesKinds({ kind: 'cocina' }, ['ticket']), false);
  assertEquals(jobMatchesKinds({ kind: 'cambio' }, ['barra']), true);
  assertEquals(jobMatchesKinds({ kind: 'corte' }, null), true);
});

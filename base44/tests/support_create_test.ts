// support.createTicket (D9 of the Supabase migration): the server builds the
// ticket from the session. Each test says what a bar would see if it broke.
//   deno test --allow-env base44/tests/support_create_test.ts
import { buildNewTicket, LogicError, TICKET_KINDS } from '../functions/support/handlers/_logic.ts';

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg ?? 'assertEquals'}\n  actual:   ${a}\n  expected: ${e}`);
}
function assertCode(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (e) {
    if (e instanceof LogicError && e.code === code) return;
    throw e;
  }
  throw new Error(`expected ${code}`);
}

const NOW = '2026-10-16T12:00:00.000Z';

Deno.test('the bar and the author come from the session, never from the body', () => {
  const row = buildNewTicket(
    { kind: 'soporte', subject: '  No imprime  ', body: ' La caja ', tenant_id: 'otro-bar', created_by_email: 'falso@x.mx' } as never,
    'bar-1',
    'duena@vindima.mx',
    NOW,
  );
  assertEquals(row, {
    tenant_id: 'bar-1',
    kind: 'soporte',
    subject: 'No imprime',
    body: 'La caja',
    status: 'abierto',
    created_by_email: 'duena@vindima.mx',
    responses: [],
    last_activity_at: NOW,
  });
});

Deno.test('kind must be one the screen offers; the subject is required', () => {
  assertEquals([...TICKET_KINDS], ['soporte', 'mejora', 'baja'], 'same kinds as src/lib/supportTickets.js');
  assertCode(() => buildNewTicket({ kind: 'otro', subject: 'x' }, 'b', null, NOW), 'invalid_kind');
  assertCode(() => buildNewTicket({ kind: 'mejora', subject: '   ' }, 'b', null, NOW), 'subject_required');
});

Deno.test('long text is cut like the client did (200 and 4000)', () => {
  const row = buildNewTicket({ kind: 'baja', subject: 'a'.repeat(300), body: 'b'.repeat(5000) }, 'b', null, NOW);
  assertEquals([row.subject.length, row.body.length, row.created_by_email], [200, 4000, '']);
});

// deno test base44/tests/support_reply_test.ts
// The bar's side of a ticket conversation (support.replyTicket) and the email a
// bar gets when ACACIA answers. Zero external imports.
import { LogicError, MAX_RESPONSES, MAX_RESPONSE_BODY, authorName, buildBarReply } from '../functions/support/handlers/_logic.ts';
import * as bridge from '../functions/acaciaControl/_bridge_logic.ts';
import { buildReplyEmail } from '../functions/acaciaControl/_reply_email.ts';

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(msg || `expected ${e}, got ${a}`);
}
function assertThrowsCode(fn: () => unknown, code: string) {
  try { fn(); } catch (e) {
    if (e instanceof LogicError && e.code === code) return;
    throw new Error(`expected ${code}, got ${(e as Error).message}`);
  }
  throw new Error(`expected ${code}, nothing thrown`);
}

const NOW = '2026-09-30T21:00:00.000Z';
const AUTHOR = { name: 'Karla', email: 'karla@vindima.mx' };

Deno.test('a bar reply is appended as the bar, with the server clock', () => {
  const patch = buildBarReply({ status: 'en_proceso', responses: [{ author_role: 'acacia', body: 'hola' }] }, '  gracias ', AUTHOR, NOW);
  assertEquals(patch.responses.length, 2);
  assertEquals(patch.responses[1], { author_role: 'bar', author_name: 'Karla', author_email: 'karla@vindima.mx', body: 'gracias', created_at: NOW });
  assertEquals(patch.last_activity_at, NOW);
  assertEquals(patch.status, 'en_proceso');
});

Deno.test('replying to a closed ticket reopens it, so ACACIA sees it again', () => {
  assertEquals(buildBarReply({ status: 'cerrado' }, 'sigue fallando', AUTHOR, NOW).status, 'abierto');
});

Deno.test('empty, oversized and overflowing replies are refused', () => {
  assertThrowsCode(() => buildBarReply({}, '   ', AUTHOR, NOW), 'empty_reply');
  assertThrowsCode(() => buildBarReply({}, 'x'.repeat(MAX_RESPONSE_BODY + 1), AUTHOR, NOW), 'reply_too_long');
  const full = Array.from({ length: MAX_RESPONSES }, () => ({ body: 'x' }));
  assertThrowsCode(() => buildBarReply({ responses: full }, 'uno más', AUTHOR, NOW), 'conversation_full');
});

Deno.test('both sides of the conversation share the same limits', () => {
  assertEquals(MAX_RESPONSES, bridge.MAX_RESPONSES);
  assertEquals(MAX_RESPONSE_BODY, bridge.MAX_RESPONSE_BODY);
});

Deno.test('authorName: full name, else the part before the @', () => {
  assertEquals(authorName({ full_name: ' Karla López ', email: 'k@x.mx' }), 'Karla López');
  assertEquals(authorName({ email: 'karla@vindima.mx' }), 'karla');
  assertEquals(authorName(null), 'Bar');
});

Deno.test('reply email: escapes what people typed, keeps line breaks, links to Soporte', () => {
  const mail = buildReplyEmail({ barName: 'Vindima', ticketSubject: 'No <b>imprime</b>', replyBody: 'Hola\nya quedó <script>' });
  assertEquals(mail.subject, 'ACACIA respondió: No <b>imprime</b>');
  if (mail.body.includes('<script>') || mail.body.includes('<b>imprime')) throw new Error('unescaped user text in the email');
  if (!mail.body.includes('Hola<br>ya quedó')) throw new Error('line break lost');
  if (!mail.body.includes('https://sommel.acaciaco.com.mx/soporte')) throw new Error('no link to Soporte');
  if (!mail.body.includes('ACACIA Consultoría')) throw new Error('missing the ACACIA signature');
});

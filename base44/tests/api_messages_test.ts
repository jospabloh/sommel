// Deno tests for friendlyHttpMessage (src/lib/apiMessages.js): the Spanish
// text callFn falls back to when Base44 answers before our function does
// (rate limit, gateway error, no connection) and there is only English.
// Zero external imports.
//   deno test --allow-env base44/tests/api_messages_test.ts
// @ts-ignore: plain JS module, the same file the client imports.
import { friendlyHttpMessage } from '../../src/lib/apiMessages.js';

function assertEquals(a: unknown, b: unknown, msg?: string) {
  if (a !== b) throw new Error(`${msg ?? 'not equal'}: ${a} !== ${b}`);
}
const ENGLISH = /Request failed|Network Error|status code|timeout of/i;

Deno.test('no response at all is a connection message, never "Network Error"', () => {
  const m = friendlyHttpMessage(0, 'Network Error');
  assertEquals(ENGLISH.test(m), false);
  assertEquals(m.startsWith('No hay conexión'), true);
});

Deno.test('429, 5xx, 401, 403 and 404 each get their own Spanish sentence', () => {
  assertEquals(friendlyHttpMessage(429, 'Request failed with status code 429').startsWith('Hay muchas solicitudes seguidas'), true);
  for (const s of [500, 502, 503, 504]) {
    assertEquals(friendlyHttpMessage(s, `Request failed with status code ${s}`).startsWith('El servidor tuvo un problema'), true);
  }
  assertEquals(friendlyHttpMessage(401, 'x').startsWith('Tu sesión'), true);
  assertEquals(friendlyHttpMessage(403, 'x').startsWith('No tienes permiso'), true);
  assertEquals(friendlyHttpMessage(404, 'x').startsWith('No se encontró'), true);
});

Deno.test('another 4xx keeps a non-generic message and hides axios\' generic one', () => {
  assertEquals(friendlyHttpMessage(409, 'Ya existe'), 'Ya existe');
  assertEquals(ENGLISH.test(friendlyHttpMessage(409, 'Request failed with status code 409')), false);
  assertEquals(ENGLISH.test(friendlyHttpMessage(400, undefined)), false);
  assertEquals(ENGLISH.test(friendlyHttpMessage(400, '')), false);
});

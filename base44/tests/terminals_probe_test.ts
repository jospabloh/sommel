// terminals.probeProvisioning's pure parts. Zero external imports.
import { authHeaders, locationHasAccessToken, probeAllowed } from '../functions/terminals/_probe_logic.ts';

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg ?? 'assertEquals'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

Deno.test('only the platform role may run the probe; a bar admin may not', () => {
  assertEquals(probeAllowed('admin'), true);
  assertEquals(probeAllowed('user'), false);
  assertEquals(probeAllowed(undefined), false);
});

Deno.test('the probe reports whether a session was issued, never its value', () => {
  assertEquals(locationHasAccessToken('https://sommel.acaciaco.com.mx/?access_token=abc'), true);
  assertEquals(locationHasAccessToken('/login'), false);
  assertEquals(locationHasAccessToken(null), false);
});

Deno.test('both auth header shapes carry the token', () => {
  assertEquals(authHeaders('bearer', 't'), { Authorization: 'Bearer t' });
  assertEquals(authHeaders('api_key', 't'), { api_key: 't' });
});

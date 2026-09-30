// Deno tests for src/lib/authErrors.js (pure, zero imports): the check that
// turns "login failed because the email was never verified" into the code step.
//   deno test --allow-env base44/tests/auth_errors_test.ts
// @ts-ignore: plain JS module shared with the client bundle
import { needsEmailVerification, friendlyAuthError } from '../../src/lib/authErrors.js';

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg ?? 'assertEquals'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

Deno.test('needsEmailVerification: the messages Base44 sends for an unverified account', () => {
  assertEquals(needsEmailVerification({ message: 'Please verify your email before logging in' }), true);
  assertEquals(needsEmailVerification({ message: 'Enter the verification code we sent you' }), true);
  assertEquals(needsEmailVerification({ message: 'Email not verified' }), true);
  assertEquals(needsEmailVerification({ response: { data: { message: 'Verify your email first' } } }), true);
});

Deno.test('needsEmailVerification: other login errors keep their own message', () => {
  assertEquals(needsEmailVerification({ message: 'Invalid credentials', status: 401 }), false);
  assertEquals(needsEmailVerification({ message: 'Network Error' }), false);
  assertEquals(needsEmailVerification(null), false);
  assertEquals(needsEmailVerification(undefined), false);
  assertEquals(
    friendlyAuthError({ message: 'Invalid credentials', status: 401 }, 'x', 'login'),
    'Correo o contraseña incorrectos.'
  );
});

Deno.test('friendlyAuthError: unverified account gets the Spanish verification sentence', () => {
  const msg = friendlyAuthError({ message: 'Please verify your email', status: 403 }, 'x', 'login');
  assertEquals(msg.includes('verificado'), true);
});

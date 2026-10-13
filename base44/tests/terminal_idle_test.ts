// The terminal's auto-lock countdown (src/lib/terminal/idleLogic.js).
// José, 2026-10-13: ask "¿mantener la sesión abierta?" for the last 30 s, and
// still lock at 2 minutes if nobody answers. Each test says what would break.
//   deno test --allow-env base44/tests/terminal_idle_test.ts
// @ts-ignore: plain JS module shared with the client bundle
import { idleStatus, TERMINAL_IDLE_MS, TERMINAL_WARN_MS } from '../../src/lib/terminal/idleLogic.js';

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg ?? 'assertEquals'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

Deno.test('the lock still lands at 2 minutes: the question takes its last 30 seconds, it does not add them', () => {
  assertEquals(TERMINAL_IDLE_MS, 120_000);
  assertEquals(TERMINAL_WARN_MS, 30_000);
  assertEquals(idleStatus(120_000, 0).lock, true);
  assertEquals(idleStatus(119_999, 0).lock, false);
});

Deno.test('no question while someone is working', () => {
  assertEquals(idleStatus(89_999, 0), { lock: false, warning: false, secondsLeft: null });
});

Deno.test('the question appears 30 s before the lock and counts down whole seconds', () => {
  assertEquals(idleStatus(90_000, 0), { lock: false, warning: true, secondsLeft: 30 });
  assertEquals(idleStatus(90_001, 0).secondsLeft, 30);
  assertEquals(idleStatus(119_001, 0).secondsLeft, 1);
});

Deno.test('"Sí" restarts the whole 2 minutes, not just the 30 s', () => {
  // keepOpen() sets lastActivity = now; 90 s later there is still no question.
  assertEquals(idleStatus(100_000 + 89_000, 100_000).warning, false);
});

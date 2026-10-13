// The per-device "ocupado" log (src/lib/rateLog.js). Base44's 429s never
// reach the function logs (2026-10-13), so this list is the only record of
// when and where one happened.
//   deno test --allow-env base44/tests/rate_log_test.ts
// @ts-ignore: plain JS module shared with the client bundle
import { appendRateEvent, parseRateLog, RATE_LOG_MAX } from '../../src/lib/rateLog.js';

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg ?? 'assertEquals'}: expected ${e}, got ${a}`);
}

Deno.test('newest notice first, so the list answers "when was the last one"', () => {
  const list = appendRateEvent([{ at: '1' }], { at: '2' });
  assertEquals(list.map((e: { at: string }) => e.at), ['2', '1']);
});

Deno.test('capped: a bad afternoon cannot fill the browser storage', () => {
  let list: unknown[] = [];
  for (let i = 0; i < RATE_LOG_MAX + 10; i++) list = appendRateEvent(list, { at: String(i) });
  assertEquals(list.length, RATE_LOG_MAX);
  assertEquals((list[0] as { at: string }).at, String(RATE_LOG_MAX + 9), 'keeps the newest');
});

Deno.test('a corrupt stored value reads as empty instead of breaking Acerca', () => {
  assertEquals(parseRateLog('{oops'), []);
  assertEquals(parseRateLog('{"a":1}'), []);
  assertEquals(parseRateLog('[{"at":"x"},null,{"no":1}]'), [{ at: 'x' }]);
});

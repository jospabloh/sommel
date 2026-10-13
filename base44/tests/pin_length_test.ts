// Every PIN in a bar has the same length (4 unless the admin picks 5 or 6), so
// the keypad signs in on the last digit with no "Listo" (José, 2026-10-13).
//   deno test --allow-env base44/tests/pin_length_test.ts
import { isPinOfLength, pinLengthOf } from '../../scripts/templates/_guard_logic.ts';
import { pinLengthOf as staffPinLengthOf } from '../functions/manageStaff/_member_logic.ts';
import { validateNewPin } from '../functions/terminals/_terminal_logic.ts';
import { buildSettingsPatch } from '../functions/settings/handlers/_logic.ts';

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg ?? 'assertEquals'}: expected ${e}, got ${a}`);
}

Deno.test('a bar with no setting uses 4 digits; only 4, 5 or 6 are honored', () => {
  for (const f of [pinLengthOf, staffPinLengthOf]) {
    assertEquals(f(null), 4);
    assertEquals(f({}), 4);
    assertEquals(f({ pin_length: 6 }), 6);
    assertEquals(f({ pin_length: 3 }), 4, 'a bad stored value never makes a 3-digit keypad');
    assertEquals(f({ pin_length: '6' }), 4);
  }
});

Deno.test('server and staff screen agree on the length, so the keypad signs in where the server expects', () => {
  for (const v of [undefined, 4, 5, 6, 7]) {
    assertEquals(pinLengthOf({ pin_length: v }), staffPinLengthOf({ pin_length: v }));
  }
});

Deno.test('a new PIN must have exactly the bar length', () => {
  assertEquals(isPinOfLength('1234', 4), true);
  assertEquals(isPinOfLength('12345', 4), false, 'a 5-digit PIN in a 4-digit bar could never be typed');
  assertEquals(isPinOfLength('12a4', 4), false);
  assertEquals(validateNewPin('123456', 6), '123456');
  let code = '';
  try { validateNewPin('1234', 6); } catch (e) { code = (e as { code: string }).code; }
  assertEquals(code, 'invalid_pin');
});

Deno.test('the admin can only pick 4, 5 or 6 in Ajustes', () => {
  assertEquals(buildSettingsPatch({ pin_length: 6 }, []).pin_length, 6);
  let code = '';
  try { buildSettingsPatch({ pin_length: 8 }, []); } catch (e) { code = (e as { code: string }).code; }
  assertEquals(code, 'invalid_value');
});

// Touch-screen mode (src/lib/touch/touchLogic.js): drag-to-scroll and the
// on-screen keyboard for a POS touch screen with no physical keyboard
// (José, 2026-10-13). Each test says what would break for the bar.
//   deno test --allow-env base44/tests/touch_mode_test.ts
// @ts-ignore: plain JS module shared with the client bundle
import { applyKey, blocksDrag, handlesPointer, keyboardFor, parseTouchPrefs, passedDragThreshold, withAccent } from '../../src/lib/touch/touchLogic.js';

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg ?? 'assertEquals'}: expected ${e}, got ${a}`);
}

Deno.test('prefs: unreadable or missing storage means everything off, never on by surprise', () => {
  assertEquals(parseTouchPrefs(null), { dragScroll: false, keyboard: false });
  assertEquals(parseTouchPrefs('{bad'), { dragScroll: false, keyboard: false });
  assertEquals(parseTouchPrefs('{"keyboard":"yes","dragScroll":true}'), { dragScroll: true, keyboard: false }, 'only a real true turns it on');
});

Deno.test('drag: a tap stays a tap; only a real movement scrolls', () => {
  assertEquals(passedDragThreshold(3, 4), false, 'a 5 px wobble on a button must still click it');
  assertEquals(passedDragThreshold(0, 8), true);
});

Deno.test('drag: native touch is left alone, the mouse-like finger is handled', () => {
  assertEquals(handlesPointer('touch', 0), false, 'a real touch screen already scrolls; doubling it would jump');
  assertEquals(handlesPointer('mouse', 0), true);
  assertEquals(handlesPointer('mouse', 2), false, 'right click is not a drag');
});

Deno.test('keyboard: price and quantity fields get the number pad', () => {
  assertEquals(keyboardFor({ tag: 'INPUT', type: 'number' }), 'numeric');
  assertEquals(keyboardFor({ tag: 'INPUT', type: 'text', inputMode: 'decimal' }), 'numeric');
  assertEquals(keyboardFor({ tag: 'INPUT', type: 'email' }), 'text');
  assertEquals(keyboardFor({ tag: 'TEXTAREA' }), 'text');
});

Deno.test('keyboard: never on checkboxes, read-only fields or inputmode=none', () => {
  assertEquals(keyboardFor({ tag: 'INPUT', type: 'checkbox' }), null);
  assertEquals(keyboardFor({ tag: 'INPUT', type: 'text', readOnly: true }), null);
  assertEquals(keyboardFor({ tag: 'INPUT', type: 'text', inputMode: 'none' }), null);
  assertEquals(keyboardFor({ tag: 'BUTTON' }), null);
});

Deno.test('drag does not start inside a text field (selecting text there still works)', () => {
  assertEquals(blocksDrag({ tag: 'INPUT', type: 'text' }), true);
  assertEquals(blocksDrag({ tag: 'SELECT' }), true);
  assertEquals(blocksDrag({ tag: 'DIV' }), false);
});

Deno.test('typing: inserts at the caret and replaces a selection', () => {
  assertEquals(applyKey('vino', 2, 2, 'X'), { value: 'viXno', caret: 3 });
  assertEquals(applyKey('vino', 0, 4, 'té'), { value: 'té', caret: 2 });
  assertEquals(applyKey('12', null, null, '3'), { value: '123', caret: 3 }, 'type=number has no caret: append');
});

Deno.test('backspace: deletes one character, or the selection, and never past the start', () => {
  assertEquals(applyKey('vino', 4, 4, 'backspace'), { value: 'vin', caret: 3 });
  assertEquals(applyKey('vino', 1, 3, 'backspace'), { value: 'vo', caret: 1 });
  assertEquals(applyKey('', 0, 0, 'backspace'), { value: '', caret: 0 });
});

Deno.test('accent key: Spanish names come out right (José, Martín)', () => {
  assertEquals(withAccent('e'), 'é');
  assertEquals(withAccent('I'), 'Í');
  assertEquals(withAccent('x'), 'x', 'a consonant after ´ is unchanged');
});

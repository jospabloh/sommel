// Touch-screen mode (src/lib/touch/touchLogic.js): drag-to-scroll and the
// on-screen keyboard for a POS touch screen with no physical keyboard
// (José, 2026-10-13). Each test says what would break for the bar.
//   deno test --allow-env base44/tests/touch_mode_test.ts
// @ts-ignore: plain JS module shared with the client bundle
import { applyKey, blocksDrag, canScrollBy, dragThresholdFor, flingDistance, flingRemaining, handlesPointer, keyboardFor, lockAxis, parseTouchPrefs, passedDragThreshold, releaseVelocity, withAccent, MOMENTUM_TAU_MS } from '../../src/lib/touch/touchLogic.js';

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg ?? 'assertEquals'}: expected ${e}, got ${a}`);
}

Deno.test('prefs: finger scroll is on unless this device turned it off; the keyboard is opt-in', () => {
  assertEquals(parseTouchPrefs(null), { dragScroll: true, keyboard: false }, 'a new touch screen scrolls with the finger out of the box');
  assertEquals(parseTouchPrefs('{bad'), { dragScroll: true, keyboard: false });
  assertEquals(parseTouchPrefs('{"dragScroll":false}'), { dragScroll: false, keyboard: false }, 'an explicit off is kept');
  assertEquals(parseTouchPrefs('{"keyboard":"yes"}'), { dragScroll: true, keyboard: false }, 'only a real true turns the keyboard on');
});

Deno.test('drag: a tap stays a tap; only a real movement scrolls', () => {
  assertEquals(passedDragThreshold(3, 4), false, 'a 5 px wobble on a button must still click it');
  assertEquals(passedDragThreshold(0, 8), true);
});

Deno.test('drag: mouse-like fingers and real fingers both scroll; right click does not', () => {
  assertEquals(handlesPointer('mouse', 0), true, 'a touch screen Windows reports as a mouse');
  assertEquals(handlesPointer('touch', 0), true, 'a real finger, for boxes where the browser does not pan natively');
  assertEquals(handlesPointer('mouse', 2), false, 'right click is not a drag');
});

Deno.test('drag: a finger waits past the browser slop, so a native pan wins and nothing scrolls twice', () => {
  assertEquals(dragThresholdFor('touch') > dragThresholdFor('mouse'), true);
  assertEquals(passedDragThreshold(0, 12, dragThresholdFor('touch')), false);
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

Deno.test('fling: a quick flick keeps scrolling, a finger that stopped does not (iPad feel)', () => {
  const fast = [{ t: 0, x: 0, y: 300 }, { t: 40, x: 0, y: 200 }, { t: 80, x: 0, y: 100 }];
  const v = releaseVelocity(fast, 85);
  assertEquals(Math.round(v.vy * 100) / 100, -2.5, '200 px in 80 ms upward');
  assertEquals(flingDistance(v.vy) < -500, true, 'a flick travels well past where the finger lifted');
  const stopped = releaseVelocity(fast, 400);
  assertEquals(stopped, { vx: 0, vy: 0 }, 'holding still before lifting means no glide');
  assertEquals(flingDistance(0.05), 0, 'a slow release just stops');
});

Deno.test('fling slows down on the iOS curve and is almost done after a second', () => {
  assertEquals(flingRemaining(0), 1);
  assertEquals(Math.round(flingRemaining(MOMENTUM_TAU_MS) * 100) / 100, 0.37);
  assertEquals(flingRemaining(1000) < 0.05, true);
});

Deno.test('a mostly vertical drag only scrolls vertically, like an iPad', () => {
  assertEquals(lockAxis(5, 40), 'y', 'a list does not wobble sideways');
  assertEquals(lockAxis(40, 5), 'x');
  assertEquals(lockAxis(30, 30), 'both');
});

Deno.test('an inner list at its end hands the drag to the page', () => {
  const list = { scrollTop: 600, scrollHeight: 800, clientHeight: 200, scrollLeft: 0, scrollWidth: 300, clientWidth: 300 };
  assertEquals(canScrollBy(list, 0, 10), false, 'already at the bottom');
  assertEquals(canScrollBy(list, 0, -10), true, 'can still go up');
  assertEquals(canScrollBy(list, 10, 0), false, 'nothing to scroll sideways');
});

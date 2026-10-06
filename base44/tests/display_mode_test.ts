// The "Pantalla completa" / "Instalar Sommel" decisions
// (src/lib/screen/displayMode.js). Zero external imports.
// @ts-ignore: plain JS module, the same file the client imports.
import { fullscreenSupported, installMode, isIos, isStandalone } from '../../src/lib/screen/displayMode.js';

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg ?? 'assertEquals'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const media = (on: string[]) => (q: string) => ({ matches: on.some((m) => q.includes(m)) });

Deno.test('an installed app never offers to install itself again', () => {
  assertEquals(installMode({ standalone: true, hasPrompt: true, ios: false }), null);
  assertEquals(installMode({ standalone: true, hasPrompt: false, ios: true }), null);
});

Deno.test('Chrome with an install prompt gets the one-click button; iOS gets the instructions', () => {
  assertEquals(installMode({ standalone: false, hasPrompt: true, ios: false }), 'prompt');
  assertEquals(installMode({ standalone: false, hasPrompt: false, ios: true }), 'ios');
});

Deno.test('a browser that cannot install shows no install button rather than a dead one', () => {
  assertEquals(installMode({ standalone: false, hasPrompt: false, ios: false }), null);
});

Deno.test('standalone is detected from display-mode and from the iOS home screen flag', () => {
  assertEquals(isStandalone({ matchMedia: media(['standalone']) }), true);
  assertEquals(isStandalone({ matchMedia: media([]) }), false);
  assertEquals(isStandalone({ navigator: { standalone: true }, matchMedia: media([]) }), true);
  assertEquals(isStandalone(null), false);
});

Deno.test('iPadOS, which reports itself as a Mac, still counts as iOS; a real Mac does not', () => {
  assertEquals(isIos({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)', maxTouchPoints: 5 }), true);
  assertEquals(isIos({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 5 }), true);
  assertEquals(isIos({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 0 }), false);
});

Deno.test('fullscreen is offered only where the page can request it', () => {
  const ok = { documentElement: { requestFullscreen() {} }, fullscreenEnabled: true };
  const blocked = { documentElement: { requestFullscreen() {} }, fullscreenEnabled: false };
  const none = { documentElement: {} };
  assertEquals(fullscreenSupported(ok), true);
  assertEquals(fullscreenSupported(blocked), false);
  assertEquals(fullscreenSupported(none), false);
});

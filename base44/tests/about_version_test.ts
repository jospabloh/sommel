// Module 6 / 21: pure logic behind the About screen. (The update notice is
// Module 30's shared src/lib/useNewVersion.js, copied from the standard.)
// No external imports: the app's own plain-JS modules only, so this runs in
// the sandbox exactly as it does in CI.
//   deno test --allow-env base44/tests/about_version_test.ts
// @ts-ignore: plain JS module shared with the client bundle
import { APP_VERSION, CHANGELOG, RELEASE_DATE } from '../../src/lib/appConfig.js';
// @ts-ignore: plain JS module shared with the client bundle
import { MANUAL_SECTIONS, filterManual } from '../../src/lib/manualContent.js';

function assert(cond: unknown, msg?: string) {
  if (!cond) throw new Error(msg ?? 'assertion failed');
}
function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg ?? 'assertEquals'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

Deno.test('changelog: newest entry is the current version and is not empty', () => {
  assertEquals(CHANGELOG[0].version, APP_VERSION);
  assert(CHANGELOG[0].changes.length > 0);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(RELEASE_DATE));
});

Deno.test('changelog: seeded from PRs 5 to 14, versions unique', () => {
  const versions = CHANGELOG.map((e: { version: string }) => e.version);
  assertEquals(new Set(versions).size, versions.length);
  for (let n = 5; n <= 14; n++) assert(versions.includes(`0.${n}.0`), `missing 0.${n}.0`);
});

Deno.test('manual: every section has items and no long dashes', () => {
  for (const s of MANUAL_SECTIONS) {
    assert(s.items.length > 0, s.id);
    for (const i of s.items) assert(!`${i.q}${i.a}`.includes('—'), `${s.id}: em dash`);
  }
});

Deno.test('manual search: accent and case insensitive, all terms must match', () => {
  const ids = (q: string) => filterManual(q).map((s: { id: string }) => s.id);
  assert(ids('PROPINA').includes('cobro'));
  assert(ids('checar salida').includes('checador'));
  assert(ids('cómo').length > 3);
  assertEquals(ids('zzzznope'), []);
  assertEquals(filterManual('').length, MANUAL_SECTIONS.length);
  // a second term narrows, never widens
  assert(filterManual('turno cerrar').flatMap((s: { items: unknown[] }) => s.items).length <=
    filterManual('turno').flatMap((s: { items: unknown[] }) => s.items).length);
});

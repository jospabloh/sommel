// Deno tests for src/components/printing/escpos.js, the ESC/POS builder the
// print station sends straight to a USB printer. Zero external imports.
//   deno test --allow-env base44/tests/escpos_test.ts
// @ts-ignore: plain JS module, the same file the client imports.
import { buildDrawerPulse, buildEscPos, DRAWER_PULSE, encodeText, testLines } from '../../src/components/printing/escpos.js';

function assertEquals(a: unknown, b: unknown, msg?: string) {
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  if (sa !== sb) throw new Error(`${msg ?? 'not equal'}: ${sa} !== ${sb}`);
}
function assert(c: unknown, msg: string) { if (!c) throw new Error(msg); }
const indexOfSeq = (hay: number[], needle: number[]) => {
  for (let i = 0; i <= hay.length - needle.length; i++) if (needle.every((b, j) => hay[i + j] === b)) return i;
  return -1;
};

Deno.test('Spanish text goes out as code page 850, not UTF-8 bytes', () => {
  // UTF-8 for "ñ" is two bytes and prints as garbage on a CP850 printer; this
  // is what the first USB test would have done with any accent.
  assertEquals(encodeText('Niño ¿Sí?'), [0x4e, 0x69, 0xa4, 0x6f, 0x20, 0xa8, 0x53, 0xa1, 0x3f]);
  assertEquals(encodeText('ÁÉÍÓÚ'), [0xb5, 0x90, 0xd6, 0xe0, 0xe9]);
});

Deno.test('an unknown accent loses the accent, anything else prints as ?', () => {
  assertEquals(encodeText('ç'), [0x63]); // c, not mojibake
  assertEquals(encodeText('€'), [0x3f]);
  assertEquals(encodeText('a—b'), [0x61, 0x2d, 0x62]);
});

Deno.test('a ticket selects CP850 and the 384-dot area, so 58 and 80 mm print the same columns', () => {
  const bytes = Array.from(buildEscPos([{ text: 'Hola' }]));
  assertEquals(bytes.slice(0, 2), [0x1b, 0x40], 'starts with ESC @');
  assert(indexOfSeq(bytes, [0x1b, 0x74, 0x02]) >= 0, 'selects code page 850');
  assert(indexOfSeq(bytes, [0x1d, 0x57, 0x80, 0x01]) >= 0, 'pins the print area to 384 dots');
  assert(indexOfSeq(bytes, [0x48, 0x6f, 0x6c, 0x61, 0x0a]) >= 0, 'prints the text and a line feed');
  assert(indexOfSeq(bytes, [0x1d, 0x56, 0x00]) >= 0, 'cuts the paper');
});

Deno.test('alignment, bold and big map to ESC a, ESC E and double height only', () => {
  const bytes = Array.from(buildEscPos([{ text: 'X', align: 'right', bold: true, size: 'big' }]));
  // Double width would halve the 32 columns the server formatted for.
  assert(indexOfSeq(bytes, [0x1b, 0x61, 0x02, 0x1b, 0x45, 0x01, 0x1d, 0x21, 0x01, 0x58, 0x0a]) >= 0, 'line prefix');
});

Deno.test('the drawer only opens when asked', () => {
  const plain = Array.from(buildEscPos([{ text: 'a' }]));
  const cash = Array.from(buildEscPos([{ text: 'a' }], { openDrawer: true }));
  assertEquals(indexOfSeq(plain, DRAWER_PULSE), -1, 'no pulse on a card sale');
  assert(indexOfSeq(cash, DRAWER_PULSE) > indexOfSeq(cash, [0x1d, 0x56, 0x00]), 'pulse after the cut');
  assertEquals(Array.from(buildDrawerPulse()), [0x1b, 0x40, ...DRAWER_PULSE]);
});

Deno.test('the test ticket fits 32 columns', () => {
  for (const l of testLines(new Date('2026-10-06T12:00:00Z'))) {
    assert(String(l.text).length <= 32, `too long: ${l.text}`);
  }
});

Deno.test('bad input never throws', () => {
  assertEquals(buildEscPos(null as unknown as []).length > 0, true);
  assertEquals(encodeText(undefined), []);
});

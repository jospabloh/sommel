// Turns PrintJob.lines ([{ text, align?, bold?, size? }], contract §1) into
// ESC/POS bytes for a thermal printer reached directly over USB (no driver,
// no print dialog). Import-free on purpose: base44/tests/escpos_test.ts loads
// this same file.
//
// Plug and play across widths: the server formats every line for 32 columns
// (58 mm paper). The print area is pinned to 384 dots, which is the full width
// of a 58 mm head and a left block on an 80 mm head, so the same ticket keeps
// its columns on either printer instead of re-wrapping.

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

const PRINT_AREA_DOTS = 384;

// Code page 850 (ESC t 2), the multilingual page that Epson and the ESC/POS
// clones (Xprinter, EC Line, ...) agree on. Only what Spanish tickets use.
const CP850 = {
  'á': 0xa0, 'é': 0x82, 'í': 0xa1, 'ó': 0xa2, 'ú': 0xa3,
  'Á': 0xb5, 'É': 0x90, 'Í': 0xd6, 'Ó': 0xe0, 'Ú': 0xe9,
  'ñ': 0xa4, 'Ñ': 0xa5, 'ü': 0x81, 'Ü': 0x9a,
  '¿': 0xa8, '¡': 0xad, '°': 0xf8, '·': 0xfa, '×': 0x9e,
};

/** One character as CP850 bytes. Unknown accents lose the accent; anything
 *  else unknown prints as '?', never as mojibake. */
function encodeChar(ch) {
  const code = ch.charCodeAt(0);
  if (code >= 0x20 && code < 0x7f) return [code];
  if (ch in CP850) return [CP850[ch]];
  if (ch === '—' || ch === '–') return [0x2d]; // dashes
  if (ch === ' ') return [0x20];
  const plain = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (plain && plain !== ch) return encodeText(plain);
  return [0x3f];
}

/** A string as CP850 bytes, without control characters. */
export function encodeText(text) {
  const out = [];
  for (const ch of String(text ?? '')) out.push(...encodeChar(ch));
  return out;
}

const ALIGN = { left: 0, center: 1, right: 2 };

/** The drawer pulse (ESC p, pin 2, ~50 ms on / ~500 ms off). */
export const DRAWER_PULSE = [ESC, 0x70, 0x00, 0x19, 0xfa];

/**
 * ESC/POS bytes for one job: init, CP850, a 384-dot print area, the lines,
 * a feed and a cut. `openDrawer` adds the drawer pulse at the end.
 */
export function buildEscPos(lines, { openDrawer = false } = {}) {
  const out = [
    ESC, 0x40, // initialize
    ESC, 0x74, 0x02, // code page 850
    GS, 0x4c, 0x00, 0x00, // left margin 0
    GS, 0x57, PRINT_AREA_DOTS & 0xff, PRINT_AREA_DOTS >> 8, // print area width
  ];
  for (const line of Array.isArray(lines) ? lines : []) {
    out.push(ESC, 0x61, ALIGN[line?.align] ?? 0);
    out.push(ESC, 0x45, line?.bold ? 1 : 0);
    // "big" = double height only, so a line keeps its 32 columns.
    out.push(GS, 0x21, line?.size === 'big' ? 0x01 : 0x00);
    out.push(...encodeText(line?.text ?? ''), LF);
  }
  out.push(ESC, 0x61, 0, ESC, 0x45, 0, GS, 0x21, 0x00);
  out.push(ESC, 0x64, 0x04); // feed 4 lines so the cut clears the text
  out.push(GS, 0x56, 0x00); // cut
  if (openDrawer) out.push(...DRAWER_PULSE);
  return new Uint8Array(out);
}

/** Just the drawer pulse, for the station's "Abrir cajón" button. */
export function buildDrawerPulse() {
  return new Uint8Array([ESC, 0x40, ...DRAWER_PULSE]);
}

/** A short test ticket: accents, both alignments, bold and big. */
export function testLines(now = new Date()) {
  const when = now.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
  return [
    { text: 'SOMMEL', align: 'center', bold: true, size: 'big' },
    { text: 'Prueba de impresión', align: 'center' },
    { text: when, align: 'center' },
    { text: '--------------------------------' },
    { text: 'Acentos: á é í ó ú ñ Ñ ¿ ¡' },
    { text: '12345678901234567890123456789012' },
    { text: 'Total            $1,234.50', bold: true },
    { text: 'Si ves bien esta hoja, ya quedó.', align: 'center' },
  ];
}

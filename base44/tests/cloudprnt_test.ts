// Star CloudPRNT (2026-10-06): the printer polls Sommel by itself. Each test
// names what a bar would see if the rule drifted. No hardware was available:
// the StarPRNT bytes are pinned to Star's command reference, not to a print.
import {
  CLAIM_STALE_MS,
  MEDIA_TYPE,
  PRINT_KINDS,
  barCanPrint,
  buildPlainText,
  buildStarPrnt,
  claimId,
  confirmOutcome,
  encodeText,
  normalizeFormat,
  parseCredentials,
  pickJob,
  printerKinds,
  renderJob,
  sameDigest,
  sha256Hex,
} from '../functions/cloudprnt/_logic.ts';
import { PRINT_KINDS as STATION_KINDS } from '../functions/printing/handlers/_logic.ts';
// @ts-ignore: plain JS modules, the same files the client imports.
import { encodeText as usbEncode } from '../../src/components/printing/escpos.js';
// @ts-ignore: plain JS module.
import { CLOUD_KINDS, cloudPrntUrl, isOnline, lastSeenLabel } from '../../src/components/printing/cloudPrinterHelpers.js';

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg ?? 'assertEquals'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const NOW = Date.parse('2026-10-06T22:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();

Deno.test('the printer authenticates with Basic or ?id=&k=; anything else is refused', () => {
  const u = new URL('https://x/fn');
  assertEquals(parseCredentials(`Basic ${btoa('p1:secreto:con:dospuntos')}`, u), { id: 'p1', secret: 'secreto:con:dospuntos' });
  assertEquals(parseCredentials(null, new URL('https://x/fn?id=p1&k=s')), { id: 'p1', secret: 's' });
  assertEquals(parseCredentials('Bearer abc', u), null);
  assertEquals(parseCredentials('Basic %%%', u), null);
  assertEquals(parseCredentials(`Basic ${btoa('sinpassword')}`, u), null);
  assertEquals(parseCredentials(null, u), null);
});

Deno.test('the password is checked by hash, never stored or compared in clear', async () => {
  const h = await sha256Hex('abc');
  assertEquals(h, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assertEquals(sameDigest(h, await sha256Hex('abc')), true);
  assertEquals(sameDigest(h, await sha256Hex('abd')), false);
  assertEquals(sameDigest(h, ''), false);
});

Deno.test('a kitchen printer takes the oldest comanda, never a ticket; an abandoned claim comes back', () => {
  const kinds = printerKinds(['cocina', 'barra']);
  assertEquals(kinds.includes('cambio'), true, 'comanda changes ride with cocina/barra');
  const jobs = [
    { id: 't1', kind: 'ticket', status: 'pendiente', created_date: ago(9000) },
    { id: 'c2', kind: 'cocina', status: 'pendiente', created_date: ago(1000) },
    { id: 'c1', kind: 'cocina', status: 'reclamado', claimed_at: ago(CLAIM_STALE_MS + 1), created_date: ago(5000) },
    { id: 'c0', kind: 'cocina', status: 'reclamado', claimed_at: ago(1000), created_date: ago(8000) },
  ];
  assertEquals(pickJob(jobs, kinds, NOW)?.id, 'c1');
  assertEquals(pickJob([jobs[0]], kinds, NOW), null);
  assertEquals(pickJob([jobs[3]], kinds, NOW), null, 'a fresh claim belongs to whoever holds it');
  assertEquals(printerKinds([]).length, PRINT_KINDS.length, 'empty = everything, never nothing');
});

Deno.test('the printer\'s confirmation decides printed vs failed', () => {
  assertEquals(confirmOutcome('200 OK').status, 'impreso');
  assertEquals(confirmOutcome('200%20OK').status, 'impreso');
  assertEquals(confirmOutcome('410 Paper out').status, 'fallido');
  assertEquals(confirmOutcome(null).status, 'fallido');
});

Deno.test('a suspended or archived bar does not print, like the USB station', () => {
  assertEquals(barCanPrint({ billing_status: 'trial' }), true);
  assertEquals(barCanPrint({ billing_status: 'view_only' }), false);
  assertEquals(barCanPrint({ billing_status: 'suspended' }), false);
  assertEquals(barCanPrint({ billing_status: 'active', archived_at: '2026-01-01' }), false);
  assertEquals(barCanPrint(null), false);
});

Deno.test('accents come out with the same bytes as the USB printer', () => {
  const s = 'Café ñ ¿Sí? ¡Ya! Pingüino 3×2';
  assertEquals(encodeText(s, true), usbEncode(s));
  assertEquals(new TextDecoder().decode(new Uint8Array(encodeText('Café ñ ¿Sí?', false))), 'Cafe n ?Si?');
});

Deno.test('StarPRNT: init, code page 858, bold, double height, cut; drawer only on a non-reprint cash ticket', () => {
  const lines = [{ text: 'MESA 4', align: 'center', bold: true, size: 'big' }, { text: 'Vino' }];
  const b = [...buildStarPrnt(lines)];
  assertEquals(b.slice(0, 6), [0x1b, 0x40, 0x1b, 0x1d, 0x74, 0x04]);
  assertEquals(b.slice(6, 10), [0x1b, 0x1d, 0x61, 1], 'centered');
  assertEquals(b.slice(10, 12), [0x1b, 0x45], 'bold on');
  assertEquals(b.slice(12, 16), [0x1b, 0x69, 1, 0], 'double height');
  assertEquals(b.slice(-3), [0x1b, 0x64, 0x03], 'partial cut at the end');
  assertEquals(renderJob({ lines, open_drawer: true }, 'starprnt').body.at(-1), 0x07);
  assertEquals(renderJob({ lines, open_drawer: true, reprint_of: 'x' }, 'starprnt').body.at(-1), 0x03);
  assertEquals(renderJob({ lines }, 'text').type, MEDIA_TYPE.text);
  assertEquals(new TextDecoder().decode(buildPlainText(lines)), 'MESA 4\nVino\n\n\n');
  assertEquals(normalizeFormat('garbage'), 'starprnt');
});

Deno.test('client and server agree: kinds, claim ids, URL and online label', () => {
  for (const k of CLOUD_KINDS) if (!(STATION_KINDS as readonly string[]).includes(k)) throw new Error(k);
  assertEquals([...PRINT_KINDS], [...STATION_KINDS]);
  assertEquals(claimId('abc'), 'cloud:abc');
  assertEquals(cloudPrntUrl('https://sommel.acaciaco.com.mx/', 'APP'), 'https://sommel.acaciaco.com.mx/api/apps/APP/functions/cloudprnt');
  assertEquals(isOnline(new Date(NOW - 30_000).toISOString(), NOW), true);
  assertEquals(isOnline(new Date(NOW - 5 * 60_000).toISOString(), NOW), false);
  assertEquals(lastSeenLabel(null, NOW), 'Nunca se ha conectado');
});

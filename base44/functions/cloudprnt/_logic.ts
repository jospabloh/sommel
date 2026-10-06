// Star CloudPRNT (2026-10-06): a network printer with no computer next to it.
// The printer itself polls Sommel over the internet (POST), downloads the job
// (GET) and confirms it (DELETE). Nothing is installed in the bar.
// ZERO imports on purpose: base44/tests/cloudprnt_test.ts loads this file.

export class LogicError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

/** A `reclamado` job older than this goes back to the queue (same as printing). */
export const CLAIM_STALE_MS = 2 * 60 * 1000;
/** last_seen_at is written at most this often (each write spends Base44 quota). */
export const SEEN_WRITE_EVERY_MS = 60 * 1000;
export const PRINT_KINDS = ['cocina', 'barra', 'cambio', 'ticket', 'corte'] as const;
export const FORMATS = ['starprnt', 'text'] as const;
export type Format = (typeof FORMATS)[number];

export const MEDIA_TYPE: Record<Format, string> = {
  starprnt: 'application/vnd.star.starprnt',
  text: 'text/plain',
};

/** claimed_by for a cloud printer (never collides with a browser device id). */
export function claimId(printerId: string): string {
  return `cloud:${printerId}`;
}

// ---- Auth: HTTP Basic (user = printer id, password = secret), or ?id=&k= ----

export function parseCredentials(authHeader: string | null, url: URL): { id: string; secret: string } | null {
  if (authHeader && /^basic\s+/i.test(authHeader)) {
    try {
      const decoded = atob(authHeader.replace(/^basic\s+/i, '').trim());
      const i = decoded.indexOf(':');
      if (i > 0) return { id: decoded.slice(0, i), secret: decoded.slice(i + 1) };
    } catch {
      return null;
    }
    return null;
  }
  const id = url.searchParams.get('id');
  const secret = url.searchParams.get('k');
  return id && secret ? { id, secret } : null;
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time comparison of two hex digests. */
export function sameDigest(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---- Which job ----

interface JobLike {
  id?: string;
  kind?: string | null;
  status?: string | null;
  claimed_by?: string | null;
  claimed_at?: string | null;
  created_date?: string | null;
}

/** Kinds stored on the printer; an empty or broken list means "everything". */
export function printerKinds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [...PRINT_KINDS];
  const set = PRINT_KINDS.filter((k) => raw.includes(k));
  if (set.length === 0) return [...PRINT_KINDS];
  // A comanda change rides with cocina/barra, like in the browser station.
  if ((set.includes('cocina') || set.includes('barra')) && !set.includes('cambio')) set.push('cambio');
  return set;
}

/** Oldest job this printer may take: pending, or claimed and abandoned. */
export function pickJob<T extends JobLike>(jobs: T[], kinds: string[], nowMs: number): T | null {
  const ok = jobs.filter((j) => {
    if (!kinds.includes(String(j.kind))) return false;
    if (j.status === 'pendiente') return true;
    if (j.status !== 'reclamado') return false;
    const at = Date.parse(j.claimed_at ?? '');
    return Number.isNaN(at) || nowMs - at > CLAIM_STALE_MS;
  });
  ok.sort((a, b) => {
    const ta = Date.parse(a.created_date ?? '') || Number.MAX_SAFE_INTEGER;
    const tb = Date.parse(b.created_date ?? '') || Number.MAX_SAFE_INTEGER;
    return ta !== tb ? ta - tb : String(a.id ?? '').localeCompare(String(b.id ?? ''));
  });
  return ok[0] ?? null;
}

/** The printer's confirmation: "200 OK" (any 2xx) is printed, anything else failed. */
export function confirmOutcome(code: string | null): { status: 'impreso' | 'fallido'; error: string } {
  const c = String(code ?? '').trim();
  if (/^2\d\d/.test(c)) return { status: 'impreso', error: '' };
  return { status: 'fallido', error: `La impresora respondió: ${c || 'sin código'}`.slice(0, 200) };
}

/** Bars that cannot write don't print either (same rule as printing.claimNext). */
export function barCanPrint(bar: { billing_status?: string | null; archived_at?: string | null } | null | undefined): boolean {
  if (!bar || bar.archived_at) return false;
  return bar.billing_status !== 'suspended' && bar.billing_status !== 'view_only';
}

// ---- Rendering PrintJob.lines ([{ text, align?, bold?, size? }]) ----

interface Line {
  text?: string;
  align?: string;
  bold?: boolean;
  size?: string;
}

// Code page 858 on Star printers (ESC GS t 4) = 850 plus the euro sign; same
// bytes as the browser's ESC/POS encoder (src/components/printing/escpos.js).
const CP858: Record<string, number> = {
  'á': 0xa0, 'é': 0x82, 'í': 0xa1, 'ó': 0xa2, 'ú': 0xa3,
  'Á': 0xb5, 'É': 0x90, 'Í': 0xd6, 'Ó': 0xe0, 'Ú': 0xe9,
  'ñ': 0xa4, 'Ñ': 0xa5, 'ü': 0x81, 'Ü': 0x9a,
  '¿': 0xa8, '¡': 0xad, '°': 0xf8, '·': 0xfa, '×': 0x9e,
};

function encodeChar(ch: string, accents: boolean): number[] {
  const code = ch.charCodeAt(0);
  if (code >= 0x20 && code < 0x7f) return [code];
  if (accents && ch in CP858) return [CP858[ch]];
  if (ch === '—' || ch === '–') return [0x2d];
  if (ch === ' ') return [0x20];
  const plain = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (plain && plain !== ch) return encodeText(plain, accents);
  if (!accents && ch === '¿') return [0x3f];
  if (!accents && ch === '¡') return [0x21];
  return [0x3f];
}

/** Text as bytes: CP858 with accents (StarPRNT) or plain ASCII (text/plain). */
export function encodeText(text: string, accents = true): number[] {
  const out: number[] = [];
  for (const ch of String(text ?? '')) out.push(...encodeChar(ch, accents));
  return out;
}

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;
const ALIGN: Record<string, number> = { left: 0, center: 1, right: 2 };

/**
 * StarPRNT command bytes (Star TSP100IV, TSP650II, mC-Print3...). Unverified on
 * hardware: the commands come from Star's StarPRNT reference. If a printer
 * prints garbage, switch it to "Texto simple" in Impresión.
 */
export function buildStarPrnt(lines: unknown, opts: { openDrawer?: boolean } = {}): Uint8Array {
  const out: number[] = [
    ESC, 0x40, // initialize
    ESC, GS, 0x74, 0x04, // code page 858
  ];
  for (const line of (Array.isArray(lines) ? lines : []) as Line[]) {
    out.push(ESC, GS, 0x61, ALIGN[String(line?.align)] ?? 0); // alignment
    out.push(ESC, line?.bold ? 0x45 : 0x46); // ESC E bold on / ESC F off
    out.push(ESC, 0x69, line?.size === 'big' ? 0x01 : 0x00, 0x00); // ESC i: double height only
    out.push(...encodeText(line?.text ?? '', true), LF);
  }
  out.push(ESC, GS, 0x61, 0, ESC, 0x46, ESC, 0x69, 0x00, 0x00);
  out.push(LF, LF, LF);
  out.push(ESC, 0x64, 0x03); // partial cut with feed
  if (opts.openDrawer) out.push(0x07); // BEL: drawer 1
  return new Uint8Array(out);
}

/** Plain text, for printers (or settings) where StarPRNT prints garbage. */
export function buildPlainText(lines: unknown): Uint8Array {
  const out: number[] = [];
  for (const line of (Array.isArray(lines) ? lines : []) as Line[]) {
    out.push(...encodeText(line?.text ?? '', false), LF);
  }
  out.push(LF, LF);
  return new Uint8Array(out);
}

export function renderJob(job: { lines?: unknown; open_drawer?: boolean; reprint_of?: string | null }, format: Format): { body: Uint8Array; type: string } {
  if (format === 'text') return { body: buildPlainText(job.lines), type: MEDIA_TYPE.text };
  // A reprint never opens the drawer, same as the USB station.
  return { body: buildStarPrnt(job.lines, { openDrawer: job.open_drawer === true && !job.reprint_of }), type: MEDIA_TYPE.starprnt };
}

export function normalizeFormat(raw: unknown): Format {
  return raw === 'text' ? 'text' : 'starprnt';
}

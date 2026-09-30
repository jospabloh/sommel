// Canonical email layout for every message Sommel sends (corte de caja,
// staff invitation). Zero imports, so `deno test` loads it directly.
//
// `npm run generate:guards` copies this file to each function directory in
// EMAIL_TARGET_DIRS (scripts/generate-guards.mjs); `npm run check:guards`
// fails on drift. Edit this template, never the copies.
//
// Inline styles only: Gmail and Outlook drop <style> blocks and external CSS,
// so every rule lives on the element that needs it. Base44's SendEmail sends
// the body as HTML as-is (verified 2026-09-28: only a tracking pixel is added).

export const APP_URL = 'https://sommel.acaciaco.com.mx';

export const EMAIL_COLORS = {
  page: '#F3EFEE',
  card: '#FFFFFF',
  ink: '#2B2320',
  muted: '#7C706A',
  hair: '#E8E1DE',
  wine: '#6E1F33',
  ok: '#2F6B4F',
  okBg: '#EAF3EE',
  short: '#A3342B',
  shortBg: '#FBECEA',
  over: '#8A5A12',
  overBg: '#FBF3E4',
};

export const EMAIL_SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
export const EMAIL_SERIF = "Georgia,'Times New Roman',serif";

/** Escapes text for HTML: names, reasons and comments are typed by people. */
export function escapeHtml(text: unknown): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** A full-width call to action. `href` must already be a safe absolute URL. */
export function emailButton(label: string, href: string): string {
  const C = EMAIL_COLORS;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="border-radius:10px;background:${C.wine};">` +
    `<a href="${escapeHtml(href)}" style="display:block;padding:14px 18px;font:700 16px/1.2 ${EMAIL_SANS};color:#FFFFFF;text-decoration:none;border-radius:10px;">${escapeHtml(label)}</a>` +
    `</td></tr></table>`;
}

export interface EmailShellInput {
  /** Document <title>, usually the subject. Plain text; escaped here. */
  title: string;
  /** Hidden inbox preview line. Plain text; escaped here. */
  preheader?: string;
  /** Small uppercase label above the heading. Plain text; escaped here. */
  eyebrow: string;
  /** Wine-colored serif heading (the bar's name). Plain text; escaped here. */
  heading: string;
  /** Muted line under the heading. Plain text; escaped here. */
  subheading?: string;
  /** Body rows: already-built HTML `<tr>` elements for the card table. */
  rowsHtml: string;
  /** Footer lines above the signature. Already-escaped HTML. */
  footerHtml?: string;
}

/**
 * The card every Sommel email sits in: header, body rows, and a footer that
 * always signs "Sommel · by ACACIA Consultoría".
 */
export function emailShell(input: EmailShellInput): string {
  const C = EMAIL_COLORS;
  const e = escapeHtml;
  const pre = input.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${e(input.preheader)}</div>`
    : '';
  const sub = input.subheading
    ? `<div style="font:400 14px/1.4 ${EMAIL_SANS};color:${C.muted};padding-top:4px;">${e(input.subheading)}</div>`
    : '';
  const footer = input.footerHtml ? `${input.footerHtml}<br>` : '';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(input.title)}</title></head>
<body style="margin:0;padding:0;background:${C.page};">${pre}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:${C.card};border-radius:14px;border-collapse:separate;">
<tr><td style="padding:24px 24px 0;">
  <div style="font:700 11px/1 ${EMAIL_SANS};letter-spacing:1.2px;text-transform:uppercase;color:${C.muted};">${e(input.eyebrow)}</div>
  <div style="font:700 26px/1.2 ${EMAIL_SERIF};color:${C.wine};padding-top:6px;">${e(input.heading)}</div>
  ${sub}
</td></tr>
${input.rowsHtml}
<tr><td style="padding:22px 24px 24px;"><div style="border-top:1px solid ${C.hair};padding-top:14px;font:400 12px/1.5 ${EMAIL_SANS};color:${C.muted};">${footer}<span style="font:700 13px/1.5 ${EMAIL_SERIF};color:${C.wine};">Sommel</span> · by <span style="font-weight:700;color:${C.ink};">ACACIA Consultoría</span></div></td></tr>
</table></td></tr></table></body></html>`;
}

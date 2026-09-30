// Email to a bar when ACACIA answers one of its support tickets. Pure: imports
// only the generated, import-free `./_email.ts`, so `deno test` loads it.
import { APP_URL, EMAIL_COLORS, EMAIL_SANS, emailButton, emailShell, escapeHtml } from './_email.ts';

export interface ReplyEmailInput {
  barName: string;
  ticketSubject: string;
  replyBody: string;
}

export function buildReplyEmail(input: ReplyEmailInput): { subject: string; body: string } {
  const C = EMAIL_COLORS;
  const e = escapeHtml;
  const ticket = String(input.ticketSubject ?? '').replace(/[\r\n]+/g, ' ').trim() || 'tu ticket';
  const subject = `ACACIA respondió: ${ticket}`.slice(0, 200);
  // Line breaks the support person typed survive; everything else is escaped.
  const reply = e(input.replyBody).replace(/\r?\n/g, '<br>');
  const rowsHtml =
    `<tr><td style="padding:14px 24px 0;font:400 15px/1.55 ${EMAIL_SANS};color:${C.ink};">ACACIA Soporte respondió a tu ticket <strong>${e(ticket)}</strong>:</td></tr>` +
    `<tr><td style="padding:12px 24px 0;"><div style="background:${C.page};border-left:3px solid ${C.wine};border-radius:8px;padding:12px 14px;font:400 15px/1.55 ${EMAIL_SANS};color:${C.ink};">${reply}</div></td></tr>` +
    `<tr><td style="padding:22px 24px 0;">${emailButton('Ver y responder', `${APP_URL}/soporte`)}</td></tr>` +
    `<tr><td style="padding:12px 24px 0;font:400 13px/1.5 ${EMAIL_SANS};color:${C.muted};">Puedes contestar desde Soporte en Sommel. Si respondes a este correo, no nos llega.</td></tr>`;
  return {
    subject,
    body: emailShell({
      title: subject,
      preheader: `ACACIA Soporte respondió a "${ticket}".`,
      eyebrow: 'Soporte',
      heading: input.barName || 'Tu bar',
      rowsHtml,
    }),
  };
}

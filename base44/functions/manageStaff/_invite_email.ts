// Staff invitation email. Replaces Base44's generic inviteUser message so the
// invite looks like the rest of Sommel and names the bar and who invited.
// Pure: imports only the generated, import-free `./_email.ts`, so `deno test`
// loads it offline. Verified 2026-09-28 that Base44's SendEmail (service role)
// delivers to an address with no account in the app.
import { APP_URL, EMAIL_COLORS, EMAIL_SANS, emailButton, emailShell, escapeHtml } from './_email.ts';

export interface InviteEmailInput {
  barName: string;
  inviterName: string;
  email: string;
  role: 'staff' | 'bar_admin';
  /** true when the address already had an account and joined right away. */
  existingAccount: boolean;
  /** ISO expiry of the pending invite (new accounts only). */
  expiresAt?: string;
}

const ROLE_LABEL = { staff: 'parte del equipo', bar_admin: 'administrador del bar' };

/** dd/mm/yyyy in the bar's local time (UTC-6, no DST since 2022). */
function localDate(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const [y, m, d] = new Date(t - 360 * 60_000).toISOString().slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function buildInviteEmail(input: InviteEmailInput): { subject: string; body: string } {
  const C = EMAIL_COLORS;
  const e = escapeHtml;
  const role = ROLE_LABEL[input.role] ?? ROLE_LABEL.staff;
  const p = (html: string) =>
    `<tr><td style="padding:14px 24px 0;font:400 15px/1.55 ${EMAIL_SANS};color:${C.ink};">${html}</td></tr>`;

  if (input.existingAccount) {
    const subject = `Ya tienes acceso a ${input.barName} en Sommel`;
    const rowsHtml =
      p(`<strong>${e(input.inviterName)}</strong> te agregó a <strong>${e(input.barName)}</strong> como ${role}. Ya puedes tomar órdenes y ver las mesas del bar.`) +
      p(`Entra con tu correo de siempre: <strong>${e(input.email)}</strong>.`) +
      `<tr><td style="padding:22px 24px 0;">${emailButton('Entrar a Sommel', `${APP_URL}/login`)}</td></tr>`;
    return {
      subject,
      body: emailShell({
        title: subject,
        preheader: `${input.inviterName} te agregó a ${input.barName}.`,
        eyebrow: 'Ya eres parte del equipo',
        heading: input.barName,
        rowsHtml,
      }),
    };
  }

  const subject = `${input.inviterName} te invitó a ${input.barName} en Sommel`;
  const registerUrl = `${APP_URL}/register?email=${encodeURIComponent(input.email)}`;
  const step = (n: number, html: string) =>
    `<tr><td width="28" valign="top" style="padding:6px 0;font:700 14px/1.5 ${EMAIL_SANS};color:${C.wine};">${n}.</td>` +
    `<td style="padding:6px 0;font:400 14px/1.5 ${EMAIL_SANS};color:${C.ink};">${html}</td></tr>`;
  const expires = input.expiresAt ? localDate(input.expiresAt) : '';
  const rowsHtml =
    p(`<strong>${e(input.inviterName)}</strong> te invitó a unirte a <strong>${e(input.barName)}</strong> en Sommel como ${role}.`) +
    `<tr><td style="padding:16px 24px 0;"><div style="background:${C.page};border-radius:10px;padding:10px 14px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">` +
    step(1, `Crea tu cuenta con este correo: <strong>${e(input.email)}</strong>`) +
    step(2, 'Escribe el código que te llega por correo') +
    step(3, `Entras directo a ${e(input.barName)}`) +
    `</table></div></td></tr>` +
    `<tr><td style="padding:22px 24px 0;">${emailButton('Crear mi cuenta', registerUrl)}</td></tr>` +
    (expires
      ? `<tr><td style="padding:12px 24px 0;font:400 13px/1.5 ${EMAIL_SANS};color:${C.muted};">La invitación vence el ${expires}. Si no esperabas este correo, puedes ignorarlo.</td></tr>`
      : '');
  return {
    subject,
    body: emailShell({
      title: subject,
      preheader: `Crea tu cuenta con ${input.email} para entrar a ${input.barName}.`,
      eyebrow: 'Invitación',
      heading: input.barName,
      rowsHtml,
    }),
  };
}

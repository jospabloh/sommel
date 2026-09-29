// Deno tests for the shared email layout (scripts/templates/_email.ts) and the
// staff invitation email. Zero external imports, runs offline.
//
// Why these matter: every email Sommel sends must read well on a phone, sign
// "by ACACIA Consultoría" (José's requirement, 2026-09-28), and never turn
// text a person typed (bar name, inviter name) into markup in someone's inbox.
import { emailShell, emailButton, escapeHtml } from '../../scripts/templates/_email.ts';
import { buildInviteEmail } from '../functions/manageStaff/_invite_email.ts';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}
const textOf = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

Deno.test('emailShell: HTML document, signed by ACACIA Consultoría, escapes header text', () => {
  const html = emailShell({ title: 'T', eyebrow: 'Ojo', heading: 'Bar <b>x</b>', rowsHtml: '' });
  assert(html.startsWith('<!doctype html>'), 'must be an HTML document');
  assert(textOf(html).includes('Sommel · by ACACIA Consultoría'), 'footer must sign by ACACIA Consultoría');
  assert(!html.includes('<b>x</b>') && html.includes('Bar &lt;b&gt;x&lt;/b&gt;'), 'heading must be escaped');
});

Deno.test('emailButton: escapes label and href', () => {
  const html = emailButton('Entrar "ya"', 'https://a.test/?q="x"');
  assert(html.includes('Entrar &quot;ya&quot;') && html.includes('q=&quot;x&quot;'), 'button must escape');
  assert(escapeHtml(null) === '', 'null escapes to empty');
});

Deno.test('invite email (no account): names bar and inviter, register link with the email, expiry, signed', () => {
  const { subject, body } = buildInviteEmail({
    barName: 'Vindima', inviterName: 'Alby', email: 'karla+1@bar.mx', role: 'staff',
    existingAccount: false, expiresAt: '2026-10-12T18:00:00.000Z',
  });
  assert(subject === 'Alby te invitó a Vindima en Sommel', `subject: ${subject}`);
  const text = textOf(body);
  for (const t of ['Invitación', 'Alby te invitó a unirte a Vindima en Sommel como parte del equipo',
    'Crea tu cuenta con este correo: karla+1@bar.mx',
    'Escribe el código de 6 números que te llega en un correo en inglés ("Verify your email for Sommel")',
    'Crear mi cuenta', 'La invitación vence el 12/10/2026',
    'by ACACIA Consultoría']) {
    assert(text.includes(t), `should include "${t}"\n${text}`);
  }
  assert(body.includes('https://sommel.acaciaco.com.mx/register?email=karla%2B1%40bar.mx'), 'register link must carry the encoded email');
  assert(!text.includes('—'), 'no em dashes in user-facing text');
});

Deno.test('invite email (existing account): login link, role label for admin', () => {
  const { subject, body } = buildInviteEmail({
    barName: 'Vindima', inviterName: 'Alby', email: 'luis@bar.mx', role: 'bar_admin', existingAccount: true,
  });
  assert(subject === 'Ya tienes acceso a Vindima en Sommel', `subject: ${subject}`);
  const text = textOf(body);
  assert(text.includes('como administrador del bar'), 'admin role label');
  assert(body.includes('https://sommel.acaciaco.com.mx/login'), 'login link');
  assert(!body.includes('/register'), 'existing account must not be sent to register');
});

Deno.test('invite email: typed names are escaped', () => {
  const { body } = buildInviteEmail({
    barName: '<script>x</script>', inviterName: '<img src=x onerror=alert(1)>', email: 'a@b.mx', role: 'staff', existingAccount: false,
  });
  assert(!body.includes('<script>x') && !body.includes('<img src=x'), 'names must not become markup');
});

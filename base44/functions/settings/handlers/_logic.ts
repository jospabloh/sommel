// Pure validation for the `settings` endpoint (entrega-2-contratos.md §5
// "settings"). ZERO imports on purpose so `deno test` loads it offline.
// Handlers catch `LogicError` and re-throw it as `HttpError(400, ...)`.

export class LogicError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export interface PaymentMethod {
  key: string;
  label: string;
  is_cash: boolean;
  active: boolean;
}

export const MAX_CORTE_EMAILS = 10;
export const EDITABLE_FIELDS = [
  'address',
  'rfc',
  'ticket_header',
  'ticket_footer',
  'payment_methods',
  'corte_emails',
  'prep_goal_kitchen_min',
  'prep_goal_bar_min',
] as const;

const KEY_RE = /^[a-z0-9][a-z0-9_]{0,23}$/;
const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/;
const RFC_RE = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;

/** Lowercase slug from a label, e.g. "Vales de despensa" -> "vales_de_despensa". */
export function slugifyKey(label: string): string {
  return String(label ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);
}

export function validateEmails(input: unknown): string[] {
  if (!Array.isArray(input)) throw new LogicError('invalid_emails', 'Los correos deben ser una lista');
  const out: string[] = [];
  for (const raw of input) {
    const email = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    if (!email) continue;
    if (email.length > 120 || !EMAIL_RE.test(email)) {
      throw new LogicError('invalid_email', `El correo "${String(raw).trim()}" no es válido`);
    }
    if (!out.includes(email)) out.push(email);
  }
  if (out.length > MAX_CORTE_EMAILS) {
    throw new LogicError('too_many_emails', `Máximo ${MAX_CORTE_EMAILS} correos`);
  }
  return out;
}

/**
 * `current` is the bar's effective list today (default list when the bar has
 * none). Rules: keys unique slugs; at least one active; at least one
 * `is_cash`; an existing key can neither disappear (deactivate it instead:
 * old payments freeze its label) nor change its `is_cash` (it would rewrite
 * how past shifts count cash).
 */
export function validatePaymentMethods(input: unknown, current: PaymentMethod[] = []): PaymentMethod[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new LogicError('invalid_payment_methods', 'Debe haber al menos una forma de pago');
  }
  if (input.length > 20) throw new LogicError('too_many_methods', 'Máximo 20 formas de pago');
  const seen = new Set<string>();
  const out: PaymentMethod[] = [];
  for (const raw of input as any[]) {
    const label = typeof raw?.label === 'string' ? raw.label.trim() : '';
    if (!label || label.length > 30) {
      throw new LogicError('invalid_method_label', 'Cada forma de pago necesita un nombre de hasta 30 letras');
    }
    const key = typeof raw?.key === 'string' && raw.key ? raw.key : slugifyKey(label);
    if (!KEY_RE.test(key)) {
      throw new LogicError('invalid_method_key', 'La clave de la forma de pago no es válida');
    }
    if (seen.has(key)) throw new LogicError('duplicate_method_key', `La forma de pago "${key}" está repetida`);
    seen.add(key);
    if (typeof raw?.is_cash !== 'boolean' || typeof raw?.active !== 'boolean') {
      throw new LogicError('invalid_payment_methods', 'Cada forma de pago necesita is_cash y active');
    }
    out.push({ key, label, is_cash: raw.is_cash, active: raw.active });
  }
  if (!out.some((m) => m.active)) {
    throw new LogicError('no_active_method', 'Debe quedar al menos una forma de pago activa');
  }
  if (!out.some((m) => m.is_cash)) {
    throw new LogicError('no_cash_method', 'Debe existir una forma de pago en efectivo');
  }
  for (const prev of current) {
    const next = out.find((m) => m.key === prev.key);
    if (!next) {
      throw new LogicError('method_removed', `No se puede quitar "${prev.label}". Desactívala en su lugar`);
    }
    if (next.is_cash !== prev.is_cash) {
      throw new LogicError('cash_flag_locked', `"${prev.label}" no puede cambiar entre efectivo y no efectivo`);
    }
  }
  return out;
}

function text(value: unknown, field: string, max: number): string {
  if (value == null) return '';
  if (typeof value !== 'string') throw new LogicError('invalid_' + field, 'Texto inválido');
  const t = value.trim();
  if (t.length > max) throw new LogicError('too_long_' + field, `Máximo ${max} caracteres`);
  return t;
}

function goal(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1 || value > 240) {
    throw new LogicError('invalid_prep_goal', 'La meta debe ser de 1 a 240 minutos');
  }
  return Math.round(value);
}

/**
 * Builds the WineBar patch from the request body: only the fields present,
 * validated. `name` (and any other unknown field) is rejected outright.
 */
export function buildSettingsPatch(body: Record<string, unknown>, currentMethods: PaymentMethod[]): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(body ?? {})) {
    if (key === 'action') continue;
    if (!(EDITABLE_FIELDS as readonly string[]).includes(key)) {
      throw new LogicError('field_not_editable', `El campo "${key}" no se puede cambiar aquí`);
    }
  }
  if ('address' in body) patch.address = text(body.address, 'address', 200);
  if ('rfc' in body) {
    const rfc = text(body.rfc, 'rfc', 13).toUpperCase();
    if (rfc && !RFC_RE.test(rfc)) throw new LogicError('invalid_rfc', 'El RFC no tiene un formato válido');
    patch.rfc = rfc;
  }
  if ('ticket_header' in body) patch.ticket_header = text(body.ticket_header, 'ticket_header', 200);
  if ('ticket_footer' in body) patch.ticket_footer = text(body.ticket_footer, 'ticket_footer', 200);
  if ('corte_emails' in body) patch.corte_emails = validateEmails(body.corte_emails);
  if ('payment_methods' in body) patch.payment_methods = validatePaymentMethods(body.payment_methods, currentMethods);
  if ('prep_goal_kitchen_min' in body) patch.prep_goal_kitchen_min = goal(body.prep_goal_kitchen_min);
  if ('prep_goal_bar_min' in body) patch.prep_goal_bar_min = goal(body.prep_goal_bar_min);
  if (Object.keys(patch).length === 0) throw new LogicError('nothing_to_update', 'No hay cambios que guardar');
  return patch;
}

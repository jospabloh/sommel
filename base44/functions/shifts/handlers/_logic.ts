// Pure logic for the `shifts` (Turno) endpoint (entrega-2-contratos.md §5
// "shifts"). ZERO imports on purpose, same reasoning as
// scripts/templates/_guard_logic.ts: this is the part `deno test` can load
// without network access (`deno.land`/`jsr.io` are blocked in the sandbox).
// Anything that needs `padLine` (the 32-column helper that lives in the
// guard) receives it as a parameter instead of importing it.
//
// The one exception is `../_email.ts`, the shared email layout: it is itself
// import-free (a generated copy of scripts/templates/_email.ts), so `deno
// test` still loads this file offline.
//
// `LogicError` is a local, import-free error type. Handlers in this directory
// catch it and re-throw as `HttpError(400, err.code, err.message)`.

import { EMAIL_COLORS, EMAIL_SANS, EMAIL_SERIF, emailShell, escapeHtml } from '../_email.ts';

export class LogicError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MethodDef {
  key: string;
  label: string;
  is_cash: boolean;
  active?: boolean;
}

export interface PaymentLike {
  method?: string | null;
  method_label?: string | null;
  amount?: number | null;
  voided_at?: string | null;
  order_id?: string | null;
}

export interface CashMovementLike {
  amount?: number | null;
  reason?: string | null;
  created_by?: string | null;
  created_date?: string | null;
}

export interface OrderLike {
  id?: string;
  status?: string | null;
  tip?: number | null;
  total?: number | null;
  discount?: number | null;
  discount_kind?: string | null;
}

export interface MethodTotal {
  key: string;
  label: string;
  is_cash: boolean;
  amount: number;
  count: number;
}

export interface CashOutLine {
  amount: number; // positive: how much left the drawer
  reason: string;
  created_by: string;
  created_date: string;
}

export interface CorteSummary {
  version: 1;
  sales_by_method: MethodTotal[];
  sales_total: number;
  tips: number;
  discounts: { count: number; amount: number };
  courtesies: { count: number; amount: number };
  cancelled_items: number;
  orders_paid: number;
  avg_ticket: number;
  opening_float: number;
  cash_sales: number;
  cash_outs: CashOutLine[];
  cash_outs_total: number;
  expected_cash: number;
  counted_cash: number;
  difference: number;
  comment: string;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

export function validateOpeningFloat(v: unknown): number {
  if (!isInt(v) || v < 0) {
    throw new LogicError('invalid_opening_float', 'El fondo de caja debe ser un monto en centavos, cero o mayor');
  }
  return v;
}

export function validateCountedCash(v: unknown): number {
  if (!isInt(v) || v < 0) {
    throw new LogicError('invalid_counted_cash', 'El efectivo contado debe ser un monto, cero o mayor');
  }
  return v;
}

export interface CashOutInput {
  /** Positive centavos taken out of the drawer. Stored NEGATIVE (contract §5). */
  amount: number;
  reason: string;
  idempotency_key: string;
}

export function validateCashOut(body: any): CashOutInput {
  const amount = body?.amount;
  if (!isInt(amount) || amount <= 0) {
    throw new LogicError('invalid_amount', 'El monto de la salida debe ser mayor a cero');
  }
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  if (!reason) throw new LogicError('reason_required', 'El motivo de la salida es obligatorio');
  if (reason.length > 200) throw new LogicError('reason_too_long', 'El motivo es demasiado largo (máximo 200 caracteres)');
  const key = typeof body?.idempotency_key === 'string' ? body.idempotency_key.trim() : '';
  if (!key) throw new LogicError('idempotency_key_required', 'Falta la llave de la operación');
  if (key.length > 100) throw new LogicError('invalid_idempotency_key', 'La llave de la operación no es válida');
  return { amount, reason, idempotency_key: key };
}

export function normalizeComment(v: unknown): string {
  if (v == null) return '';
  if (typeof v !== 'string') throw new LogicError('invalid_comment', 'El comentario no es válido');
  const c = v.trim();
  if (c.length > 500) throw new LogicError('comment_too_long', 'El comentario es demasiado largo (máximo 500 caracteres)');
  return c;
}

/** A non-zero difference needs a comment before the shift can close. */
export function requiresComment(difference: number, comment: string): boolean {
  return difference !== 0 && comment.trim() === '';
}

// ---------------------------------------------------------------------------
// Cash math
// ---------------------------------------------------------------------------

/** Keys of the payment methods that are cash. Falls back to `efectivo`. */
export function cashMethodKeys(methods: MethodDef[] | null | undefined): Set<string> {
  const keys = new Set<string>();
  for (const m of methods ?? []) if (m?.is_cash && m.key) keys.add(m.key);
  if (keys.size === 0) keys.add('efectivo');
  return keys;
}

function activePayments(payments: PaymentLike[]): PaymentLike[] {
  return (payments ?? []).filter((p) => !p.voided_at);
}

/**
 * `expected_cash = opening_float + Σ(live cash payments) + Σ(CashMovement.amount)`
 * (contract §5). Cash movements are stored negative, so they are simply added.
 */
export function computeExpectedCash(args: {
  opening_float: number;
  payments: PaymentLike[];
  cashKeys: Set<string>;
  cashMovements: CashMovementLike[];
}): { expected_cash: number; cash_sales: number; cash_outs_total: number } {
  let cashSales = 0;
  for (const p of activePayments(args.payments)) {
    if (p.method && args.cashKeys.has(p.method)) cashSales += p.amount ?? 0;
  }
  let movements = 0;
  for (const m of args.cashMovements ?? []) movements += m.amount ?? 0;
  return {
    expected_cash: (args.opening_float ?? 0) + cashSales + movements,
    cash_sales: cashSales,
    cash_outs_total: -movements,
  };
}

/** Live sales grouped by payment method, biggest first. */
export function salesByMethod(payments: PaymentLike[], methods: MethodDef[] | null | undefined): MethodTotal[] {
  const cash = cashMethodKeys(methods);
  const labels = new Map<string, string>();
  for (const m of methods ?? []) if (m?.key) labels.set(m.key, m.label);
  const groups = new Map<string, MethodTotal>();
  for (const p of activePayments(payments)) {
    const key = p.method || 'otro';
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        label: p.method_label || labels.get(key) || key,
        is_cash: cash.has(key),
        amount: 0,
        count: 0,
      };
      groups.set(key, g);
    }
    g.amount += p.amount ?? 0;
    g.count += 1;
  }
  return [...groups.values()].sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label));
}

/** Frozen photo of the corte (`Shift.summary`). */
export function buildSummary(args: {
  opening_float: number;
  payments: PaymentLike[];
  methods: MethodDef[] | null | undefined;
  paidOrders: OrderLike[]; // orders with live payments in this shift
  cancelledItems: number;
  cashMovements: CashMovementLike[];
  counted_cash: number;
  comment: string;
}): CorteSummary {
  const methodTotals = salesByMethod(args.payments, args.methods);
  const salesTotal = methodTotals.reduce((s, m) => s + m.amount, 0);
  const cash = computeExpectedCash({
    opening_float: args.opening_float,
    payments: args.payments,
    cashKeys: cashMethodKeys(args.methods),
    cashMovements: args.cashMovements,
  });

  const paid = (args.paidOrders ?? []).filter((o) => o.status === 'cobrada');
  let tips = 0;
  const discounts = { count: 0, amount: 0 };
  const courtesies = { count: 0, amount: 0 };
  for (const o of paid) {
    tips += o.tip ?? 0;
    const d = o.discount ?? 0;
    if (d > 0) {
      const bucket = o.discount_kind === 'cortesia' ? courtesies : discounts;
      bucket.count += 1;
      bucket.amount += d;
    }
  }

  const cashOuts: CashOutLine[] = (args.cashMovements ?? [])
    .filter((m) => (m.amount ?? 0) !== 0)
    .map((m) => ({
      amount: Math.abs(m.amount ?? 0),
      reason: m.reason ?? '',
      created_by: m.created_by ?? '',
      created_date: m.created_date ?? '',
    }));

  return {
    version: 1,
    sales_by_method: methodTotals,
    sales_total: salesTotal,
    tips,
    discounts,
    courtesies,
    cancelled_items: args.cancelledItems,
    orders_paid: paid.length,
    avg_ticket: paid.length > 0 ? Math.round(salesTotal / paid.length) : 0,
    opening_float: args.opening_float ?? 0,
    cash_sales: cash.cash_sales,
    cash_outs: cashOuts,
    cash_outs_total: cash.cash_outs_total,
    expected_cash: cash.expected_cash,
    counted_cash: args.counted_cash,
    difference: args.counted_cash - cash.expected_cash,
    comment: args.comment,
  };
}

// ---------------------------------------------------------------------------
// Response shaping
// ---------------------------------------------------------------------------

/**
 * Without `Turno:ver_corte` a shift never carries the numbers that reveal the
 * expected cash: `expected_cash`, `difference` and the frozen `summary`.
 */
export function redactShift<T extends Record<string, any>>(shift: T, canSeeCorte: boolean): T {
  if (canSeeCorte || !shift) return shift;
  const { expected_cash: _e, difference: _d, summary: _s, ...rest } = shift;
  return rest as T;
}

// ---------------------------------------------------------------------------
// Formatting (server side: email and ticket)
// ---------------------------------------------------------------------------

/** 123456 -> "$1,234.56"; negatives as "-$12.30". Deterministic, no Intl. */
export function fmtMoney(cents: number): string {
  const n = Math.round(Number(cents) || 0);
  const abs = Math.abs(n);
  const whole = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = (abs % 100).toString().padStart(2, '0');
  return `${n < 0 ? '-' : ''}$${whole}.${frac}`;
}

/** "YYYY-MM-DD HH:mm" in the bar's local time (fixed offset in minutes). */
export function formatLocalDateTime(iso: string, offsetMin: number): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  return new Date(t + offsetMin * 60_000).toISOString().slice(0, 16).replace('T', ' ');
}

function localTime(iso: string, offsetMin: number): string {
  return formatLocalDateTime(iso, offsetMin).slice(11);
}

export function differenceLabel(difference: number): string {
  if (difference === 0) return 'Sin diferencia';
  return difference > 0 ? 'Sobrante' : 'Faltante';
}

export interface CorteMeta {
  bar_name: string;
  opened_at: string;
  closed_at: string;
  opened_by?: string | null;
  closed_by?: string | null;
}

const C = EMAIL_COLORS;
const SANS = EMAIL_SANS;
const SERIF = EMAIL_SERIF;

/** Headline for the cash check: what Alby needs to know first. */
export function cashVerdict(difference: number): { title: string; color: string; bg: string } {
  if (difference === 0) return { title: 'La caja cuadra', color: C.ok, bg: C.okBg };
  if (difference < 0) return { title: `Faltan ${fmtMoney(-difference)}`, color: C.short, bg: C.shortBg };
  return { title: `Sobran ${fmtMoney(difference)}`, color: C.over, bg: C.overBg };
}

function emailRow(label: string, value: string, opts: { strong?: boolean; muted?: boolean; indent?: boolean; top?: boolean } = {}): string {
  const weight = opts.strong ? '700' : '400';
  const color = opts.muted ? C.muted : C.ink;
  const border = opts.top ? `border-top:1px solid ${C.hair};` : '';
  const pad = opts.indent ? 'padding:4px 0 4px 14px;' : 'padding:7px 0;';
  return `<tr><td style="${pad}${border}font:${weight} 15px/1.4 ${SANS};color:${color};">${label}</td>` +
    `<td align="right" style="${pad}${border}font:${weight} 15px/1.4 ${SANS};color:${color};white-space:nowrap;font-variant-numeric:tabular-nums;">${value}</td></tr>`;
}

function emailSection(title: string, rows: string): string {
  return `<tr><td style="padding:22px 24px 0;">` +
    `<div style="font:700 11px/1 ${SANS};letter-spacing:1.2px;text-transform:uppercase;color:${C.wine};padding-bottom:8px;border-bottom:2px solid ${C.wine};">${title}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows}</table></td></tr>`;
}

function emailStat(label: string, value: string): string {
  return `<td width="33%" valign="top" style="padding:12px 8px;text-align:center;background:${C.page};border-radius:8px;">` +
    `<div style="font:700 17px/1.2 ${SERIF};color:${C.ink};font-variant-numeric:tabular-nums;">${value}</div>` +
    `<div style="font:400 12px/1.3 ${SANS};color:${C.muted};padding-top:4px;">${label}</div></td>`;
}

/**
 * HTML email, built for a phone at closing time. Base44's SendEmail renders
 * the body as HTML (a plain-text body arrived as one run-on paragraph,
 * 2026-09-28), so structure has to be real markup. No costs, no utility
 * (D7): the summary never carries them, and this only prints what it has.
 * Every string a person typed goes through escapeHtml.
 */
export function buildCorteEmail(
  meta: CorteMeta,
  summary: CorteSummary,
  offsetMin: number
): { subject: string; body: string } {
  const date = formatLocalDateTime(meta.closed_at, offsetMin).slice(0, 10);
  const subject = `Corte de caja · ${meta.bar_name} · ${date}`;
  const [y, mo, d] = date.split('-');
  const niceDate = `${d}/${mo}/${y}`;
  const shiftSpan = `${localTime(meta.opened_at, offsetMin)} a ${localTime(meta.closed_at, offsetMin)}`;
  const verdict = cashVerdict(summary.difference);
  const e = escapeHtml;

  const salesRows = (summary.sales_by_method.length === 0
    ? emailRow('Sin ventas en el turno', '', { muted: true })
    : summary.sales_by_method
        .map((m) => emailRow(`${e(m.label)} <span style="color:${C.muted};">· ${m.count}</span>`, fmtMoney(m.amount)))
        .join('')) + emailRow('Total vendido', fmtMoney(summary.sales_total), { strong: true, top: true });

  const adjustRows =
    emailRow('Propinas', fmtMoney(summary.tips)) +
    emailRow(`Descuentos <span style="color:${C.muted};">· ${summary.discounts.count}</span>`, fmtMoney(summary.discounts.amount)) +
    emailRow(`Cortesías <span style="color:${C.muted};">· ${summary.courtesies.count}</span>`, fmtMoney(summary.courtesies.amount)) +
    emailRow('Platillos cancelados', String(summary.cancelled_items));

  const outs = summary.cash_outs.length === 0
    ? emailRow('Salidas de efectivo', 'Ninguna', { muted: true })
    : emailRow('Salidas de efectivo', `-${fmtMoney(summary.cash_outs_total)}`) +
      summary.cash_outs.map((o) => emailRow(e(o.reason), fmtMoney(o.amount), { muted: true, indent: true })).join('');
  const cashRows =
    emailRow('Fondo inicial', fmtMoney(summary.opening_float)) +
    emailRow('Ventas en efectivo', `+${fmtMoney(summary.cash_sales)}`) +
    outs +
    emailRow('Esperado en caja', fmtMoney(summary.expected_cash), { strong: true, top: true }) +
    emailRow('Contado', fmtMoney(summary.counted_cash), { strong: true });

  const comment = summary.comment
    ? `<div style="margin-top:14px;padding:10px 12px;background:${C.card};border-radius:6px;font:italic 400 14px/1.45 ${SANS};color:${C.ink};">“${e(summary.comment)}”</div>`
    : '';
  const people = [meta.opened_by ? `Abrió ${e(meta.opened_by)}` : '', meta.closed_by ? `Cerró ${e(meta.closed_by)}` : '']
    .filter(Boolean)
    .join('<br>');

  const rowsHtml = `<tr><td style="padding:18px 24px 0;">
  <div style="background:${verdict.bg};border-left:4px solid ${verdict.color};border-radius:8px;padding:16px 16px 14px;">
    <div style="font:700 24px/1.2 ${SERIF};color:${verdict.color};">${verdict.title}</div>
    <div style="font:400 14px/1.5 ${SANS};color:${C.ink};padding-top:6px;font-variant-numeric:tabular-nums;">Esperado ${fmtMoney(summary.expected_cash)} · Contado ${fmtMoney(summary.counted_cash)}</div>
    ${comment}
  </div>
</td></tr>
<tr><td style="padding:16px 18px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="6"><tr>
  ${emailStat('Vendido', fmtMoney(summary.sales_total))}${emailStat('Cuentas', String(summary.orders_paid))}${emailStat('Ticket promedio', fmtMoney(summary.avg_ticket))}
</tr></table></td></tr>
${emailSection('Ventas por forma de pago', salesRows)}
${emailSection('Propinas y ajustes', adjustRows)}
${emailSection('Efectivo', cashRows)}`;
  const body = emailShell({
    title: subject,
    preheader: `${verdict.title}. Vendido ${fmtMoney(summary.sales_total)} en ${summary.orders_paid} cuentas.`,
    eyebrow: 'Corte de caja',
    heading: meta.bar_name,
    subheading: `${niceDate} · Turno de ${shiftSpan}`,
    rowsHtml,
    footerHtml: people || undefined,
  });
  return { subject, body };
}

/** Word-wraps to `width` columns; hard-cuts words longer than a line. */
export function wrapText(text: string, width = 32): string[] {
  const out: string[] = [];
  let line = '';
  for (const raw of String(text ?? '').split(/\s+/).filter(Boolean)) {
    let word = raw;
    while (word.length > width) {
      if (line) {
        out.push(line);
        line = '';
      }
      out.push(word.slice(0, width));
      word = word.slice(width);
    }
    if (!line) line = word;
    else if (line.length + 1 + word.length <= width) line += ' ' + word;
    else {
      out.push(line);
      line = word;
    }
  }
  if (line) out.push(line);
  return out;
}

export interface PrintLine {
  text: string;
  align?: 'left' | 'center' | 'right';
  bold?: boolean;
  size?: 'normal' | 'big';
}

/** 58 mm corte ticket, 32 columns. `pad` is `padLine` from the guard. */
export function buildCorteLines(
  meta: CorteMeta,
  summary: CorteSummary,
  offsetMin: number,
  pad: (left: string, right: string, width?: number) => string
): PrintLine[] {
  const W = 32;
  const sep: PrintLine = { text: '-'.repeat(W) };
  const row = (l: string, r: string): PrintLine => ({ text: pad(l, r, W) });
  const out: PrintLine[] = [];
  out.push({ text: meta.bar_name, align: 'center', bold: true });
  out.push({ text: 'CORTE DE CAJA', align: 'center', bold: true, size: 'big' });
  out.push({ text: formatLocalDateTime(meta.closed_at, offsetMin), align: 'center' });
  out.push(sep);
  out.push({ text: 'Abrió ' + localTime(meta.opened_at, offsetMin) + '  Cerró ' + localTime(meta.closed_at, offsetMin) });
  if (meta.closed_by) for (const t of wrapText('Cerró: ' + meta.closed_by, W)) out.push({ text: t });
  out.push(sep);
  out.push({ text: 'VENTAS', bold: true });
  for (const m of summary.sales_by_method) out.push(row(`${m.label} (${m.count})`, fmtMoney(m.amount)));
  out.push({ ...row('TOTAL', fmtMoney(summary.sales_total)), bold: true });
  out.push(row('Cuentas cobradas', String(summary.orders_paid)));
  out.push(row('Ticket promedio', fmtMoney(summary.avg_ticket)));
  out.push(row('Propinas', fmtMoney(summary.tips)));
  out.push(row(`Descuentos (${summary.discounts.count})`, fmtMoney(summary.discounts.amount)));
  out.push(row(`Cortesías (${summary.courtesies.count})`, fmtMoney(summary.courtesies.amount)));
  out.push(row('Renglones cancelados', String(summary.cancelled_items)));
  out.push(sep);
  out.push({ text: 'EFECTIVO', bold: true });
  out.push(row('Fondo inicial', fmtMoney(summary.opening_float)));
  out.push(row('Ventas en efectivo', fmtMoney(summary.cash_sales)));
  for (const o of summary.cash_outs) {
    out.push(row('Salida ' + o.reason, '-' + fmtMoney(o.amount)));
  }
  out.push(row('Esperado', fmtMoney(summary.expected_cash)));
  out.push(row('Contado', fmtMoney(summary.counted_cash)));
  out.push({ ...row(differenceLabel(summary.difference), fmtMoney(summary.difference)), bold: true });
  if (summary.comment) {
    out.push(sep);
    for (const t of wrapText('Comentario: ' + summary.comment, W)) out.push({ text: t });
  }
  out.push(sep);
  return out;
}

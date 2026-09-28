// Ticket layout (entrega-2-contratos.md §5 "payments", Ticket). Only import is
// the shared, import-free `_guard_logic.ts`, so `deno test` can load it.
import { padLine } from '../_guard_logic.ts';
import { ticketMoney, formatLocalDateTime } from './_logic.ts';

export const TICKET_WIDTH = 32;
export const TICKET_DISCLAIMER = 'Este ticket no es una factura';

export interface TicketLine {
  text: string;
  align?: 'left' | 'center' | 'right';
  bold?: boolean;
  size?: 'normal' | 'big';
}

export interface TicketInput {
  bar: { name?: string; ticket_header?: string; ticket_footer?: string; rfc?: string };
  when: string; // ISO instant printed as local date and time
  place: string; // 'Mesa 4' or 'Para llevar · Ana'
  items: Array<{
    name: string;
    variant_label?: string | null;
    qty: number;
    unit_price: number;
    status?: string | null;
    modifiers?: Array<{ label?: string; key?: string }> | null;
  }>;
  order: { subtotal: number; discount: number; discount_kind?: string | null; discount_reason?: string | null; tip: number; total: number };
  payments: Array<{ method_label?: string; method?: string; amount: number; received?: number | null; change?: number | null; voided_at?: string | null }>;
}

/** Greedy word wrap; words longer than `width` are hard-cut. */
export function wrapText(text: string, width = TICKET_WIDTH): string[] {
  const out: string[] = [];
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    let line = '';
    for (let word of raw.split(/\s+/).filter(Boolean)) {
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
  }
  return out;
}

export function buildTicketLines(input: TicketInput): TicketLine[] {
  const lines: TicketLine[] = [];
  const sep: TicketLine = { text: '-'.repeat(TICKET_WIDTH) };
  const center = (text: string, bold = false) => {
    for (const t of wrapText(text)) lines.push({ text: t, align: 'center', ...(bold ? { bold: true } : {}) });
  };

  if (input.bar.name) center(input.bar.name, true);
  if (input.bar.ticket_header) center(input.bar.ticket_header);
  if (input.bar.rfc) center(`RFC ${input.bar.rfc}`);
  lines.push(sep);
  lines.push({ text: padLine('Fecha', formatLocalDateTime(input.when), TICKET_WIDTH) });
  for (const t of wrapText(input.place)) lines.push({ text: t });
  lines.push(sep);

  for (const item of input.items) {
    if (item.status === 'cancelado') continue;
    const amount = Math.round((item.unit_price || 0) * (item.qty || 0));
    lines.push({ text: padLine(`${item.qty} x ${item.name}`, ticketMoney(amount), TICKET_WIDTH) });
    if (item.variant_label) {
      for (const t of wrapText(item.variant_label, TICKET_WIDTH - 2)) lines.push({ text: '  ' + t });
    }
    const mods = (item.modifiers ?? []).map((m) => m.label || m.key || '').filter(Boolean);
    if (mods.length) {
      for (const t of wrapText(mods.join(', '), TICKET_WIDTH - 2)) lines.push({ text: '  ' + t });
    }
  }
  lines.push(sep);

  const o = input.order;
  lines.push({ text: padLine('Subtotal', ticketMoney(o.subtotal), TICKET_WIDTH) });
  if (o.discount > 0) {
    const label = o.discount_kind === 'cortesia' ? 'Cortesía' : 'Descuento';
    lines.push({ text: padLine(label, '-' + ticketMoney(o.discount), TICKET_WIDTH) });
    if (o.discount_reason) {
      for (const t of wrapText(`Motivo: ${o.discount_reason}`, TICKET_WIDTH - 2)) lines.push({ text: '  ' + t });
    }
  }
  if (o.tip > 0) lines.push({ text: padLine('Propina', ticketMoney(o.tip), TICKET_WIDTH) });
  lines.push({ text: padLine('TOTAL', ticketMoney(o.total), TICKET_WIDTH), bold: true });

  const live = input.payments.filter((p) => !p.voided_at);
  if (live.length) {
    lines.push(sep);
    for (const p of live) {
      lines.push({ text: padLine(p.method_label || p.method || 'Pago', ticketMoney(p.amount), TICKET_WIDTH) });
      if (typeof p.received === 'number') {
        lines.push({ text: padLine('  Recibido', ticketMoney(p.received), TICKET_WIDTH) });
        lines.push({ text: padLine('  Cambio', ticketMoney(p.change ?? 0), TICKET_WIDTH) });
      }
    }
  }

  lines.push(sep);
  if (input.bar.ticket_footer) center(input.bar.ticket_footer);
  center(TICKET_DISCLAIMER);
  return lines;
}

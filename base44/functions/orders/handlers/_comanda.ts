// Printed comanda (2026-10-14, José: an Ajustes switch, `print_comandas`).
// When it is on, sending to cocina/barra prints one comanda per station, and
// cancelling a line already sent prints a "cambio" for that station, so the
// kitchen stops preparing it. Only import is the import-free guard logic, so
// `deno test` can load it.
import { padLine } from '../_guard_logic.ts';

export const COMANDA_WIDTH = 32;

export interface ComandaLine {
  text: string;
  align?: 'left' | 'center' | 'right';
  bold?: boolean;
  size?: 'normal' | 'big';
}

export interface ComandaItem {
  id?: string;
  name?: string | null;
  qty?: number | null;
  variant_label?: string | null;
  modifiers?: Array<{ label?: string; key?: string }> | null;
  extras?: Array<{ name?: string }> | null;
  notes?: string | null;
  station?: string | null;
  cancel_reason?: string | null;
}

/** Print kind of each station; a line with no station never prints. */
export const STATION_KIND: Record<string, 'cocina' | 'barra'> = { kitchen: 'cocina', bar: 'barra' };

/** Lines grouped by the print kind of their station, skipping 'none'. */
export function groupByStation<T extends ComandaItem>(items: T[]): Map<'cocina' | 'barra', T[]> {
  const out = new Map<'cocina' | 'barra', T[]>();
  for (const item of items ?? []) {
    const kind = STATION_KIND[String(item?.station ?? '')];
    if (!kind) continue;
    if (!out.has(kind)) out.set(kind, []);
    out.get(kind)!.push(item);
  }
  return out;
}

/** Same lines in the same order = same job: a retried send never prints twice. */
export function comandaDedupeKey(orderId: string, kind: string, items: ComandaItem[]): string {
  const ids = (items ?? []).map((i) => String(i?.id ?? '')).sort().join(',');
  return `${kind}:${orderId}:${ids}`;
}

function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  let line = '';
  for (let word of String(text ?? '').split(/\s+/).filter(Boolean)) {
    while (word.length > width) {
      if (line) { out.push(line); line = ''; }
      out.push(word.slice(0, width));
      word = word.slice(width);
    }
    if (!line) line = word;
    else if (line.length + 1 + word.length <= width) line += ' ' + word;
    else { out.push(line); line = word; }
  }
  if (line) out.push(line);
  return out;
}

function localTime(iso: string, offsetMin = -360): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const d = new Date(t + offsetMin * 60_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/**
 * The comanda paper. `kind` 'cambio' is the cancel notice: big "CANCELADO",
 * each line with its reason. Quantities are big because the kitchen reads
 * them from a distance; prices never appear.
 */
export function buildComandaLines(input: {
  kind: 'cocina' | 'barra' | 'cambio';
  station?: 'cocina' | 'barra';
  place: string;
  when: string;
  by?: string | null;
  items: ComandaItem[];
}): ComandaLine[] {
  const W = COMANDA_WIDTH;
  const lines: ComandaLine[] = [];
  const title = input.kind === 'cambio' ? `CANCELADO ${input.station === 'barra' ? 'BARRA' : 'COCINA'}` : input.kind === 'barra' ? 'BARRA' : 'COCINA';
  lines.push({ text: title, align: 'center', bold: true, size: 'big' });
  for (const t of wrap(input.place || 'Mesa', W)) lines.push({ text: t, bold: true, size: 'big' });
  lines.push({ text: padLine(localTime(input.when), input.by ? String(input.by).slice(0, 18) : '', W) });
  lines.push({ text: '-'.repeat(W) });
  for (const item of input.items ?? []) {
    const qty = Number.isFinite(item?.qty) ? Number(item.qty) : 1;
    const prefix = input.kind === 'cambio' ? '- ' : '';
    for (const t of wrap(`${prefix}${qty} x ${item?.name || 'Producto'}`, W)) lines.push({ text: t, bold: true, size: 'big' });
    if (item?.variant_label) for (const t of wrap(item.variant_label, W - 2)) lines.push({ text: '  ' + t });
    const mods = (item?.modifiers ?? []).map((m) => m?.label || m?.key || '').filter(Boolean);
    if (mods.length) for (const t of wrap(mods.join(', '), W - 2)) lines.push({ text: '  ' + t });
    for (const e of item?.extras ?? []) {
      if (e?.name) for (const t of wrap(`+ ${e.name}`, W - 2)) lines.push({ text: '  ' + t });
    }
    if (item?.notes) for (const t of wrap(`Nota: ${item.notes}`, W - 2)) lines.push({ text: '  ' + t, bold: true });
    if (input.kind === 'cambio' && item?.cancel_reason) {
      for (const t of wrap(`Motivo: ${item.cancel_reason}`, W - 2)) lines.push({ text: '  ' + t });
    }
  }
  lines.push({ text: '-'.repeat(W) });
  return lines;
}

// Reopening the cobro panel in the middle of a split bill (after voiding a
// part, or just closing and opening it) used to start over on "Cuenta
// completa": the next part lost its "Parte 2 de 2" label and its own tip
// (2026-10-14). The live payments' labels say where the split was.
// No imports: tested in Deno (base44/tests/payment_tip_test.ts).
const PART = /^Parte (\d+) de (\d+)$/;

export function resumeSplit(livePayments) {
  const labels = (livePayments ?? []).map((p) => String(p?.split_label ?? ''));
  const parts = labels.map((l) => l.match(PART)).filter(Boolean);
  if (parts.length > 0) {
    const total = Math.max(...parts.map((m) => Number(m[2])));
    const done = parts.filter((m) => Number(m[2]) === total).length;
    if (total >= 2 && done < total) return { mode: 'equal', partsTotal: total, partsDone: done };
  }
  if (labels.includes('Por platillos')) return { mode: 'items', partsTotal: 2, partsDone: 0 };
  return null;
}

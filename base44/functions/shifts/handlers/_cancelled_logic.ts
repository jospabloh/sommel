// Pure rule for which cancelled orders belong to a shift's corte. ZERO imports
// on purpose, so `deno test` loads it with the network blocked.

export interface CancelledOrderLike {
  id: string;
  shift_id?: string | null;
  opened_at?: string;
  created_date?: string;
}

/**
 * An order cancelled outright belongs to the shift it was opened in. When it
 * carries a `shift_id`, that decides. Older rows without one fall back to the
 * shift's time window (opened at or after the shift opened, and not after it
 * closed; an open shift has no upper bound). Orders already counted through a
 * live payment (`skipIds`) are left out.
 */
export function cancelledOrdersInShift<T extends CancelledOrderLike>(
  orders: T[],
  shift: { id?: string; opened_at?: string; closed_at?: string | null },
  skipIds: Iterable<string> = []
): T[] {
  const skip = new Set(skipIds);
  const start = String(shift.opened_at ?? '');
  const end = shift.closed_at ? String(shift.closed_at) : '';
  return orders.filter((o) => {
    if (skip.has(o.id)) return false;
    if (o.shift_id) return o.shift_id === shift.id;
    const at = String(o.opened_at ?? o.created_date ?? '');
    return at >= start && (end === '' || at <= end);
  });
}

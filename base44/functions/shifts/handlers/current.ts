// shifts.current — entrega-2-contratos.md §5. Read-only, no billing gate.
// Expected cash appears only with `Turno:ver_corte` (blind close, D11).
import { hasPermission, requirePermission, type Ctx, type Route } from '../_guard.ts';
import { redactShift } from './_logic.ts';
import { findOpenShift, runningTotals } from './_shared.ts';

export const current: Route = async (ctx: Ctx) => {
  await requirePermission(ctx, 'Turno:operar');
  const shift = await findOpenShift(ctx);
  if (!shift) return { shift: null, cash_outs: [], totals_by_method: [], sales_total: 0 };

  const canSeeCorte = await hasPermission(ctx, 'Turno:ver_corte');
  const { cashMovements, totals, cash } = await runningTotals(ctx, shift);
  const cashOuts = cashMovements
    .filter((m: any) => (m.amount ?? 0) !== 0)
    .sort((a: any, b: any) => String(a.created_date).localeCompare(String(b.created_date)));

  const view = canSeeCorte ? { ...shift, expected_cash: cash.expected_cash } : redactShift(shift, false);
  // Blind close: fondo + efectivo cobrado + salidas = esperado. Without
  // Turno:ver_corte the cash amount (and the grand total, which would give it
  // away by subtraction) is withheld; counts stay so the operator still sees activity.
  const visibleTotals = canSeeCorte
    ? totals
    : totals.map((t: any) => (t.is_cash ? { ...t, amount: null } : t));
  return {
    shift: view,
    cash_outs: cashOuts,
    totals_by_method: visibleTotals,
    sales_total: canSeeCorte ? totals.reduce((s, t) => s + t.amount, 0) : null,
  };
};

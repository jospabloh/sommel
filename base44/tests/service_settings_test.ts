// Ajustes "Servicio" (José, 2026-10-14): printed comandas, auto-delivery of
// products with no station, and a cap on one cash withdrawal (plus voiding a
// withdrawal). Each test says what would go wrong in the bar.
import {
  buildComandaLines,
  comandaDedupeKey,
  groupByStation,
} from '../functions/orders/handlers/_comanda.ts';
import { sendStatusFor } from '../functions/orders/handlers/_logic.ts';
import { assertCashOutWithinCap, cashOutVoidBlocker, LogicError } from '../functions/shifts/handlers/_logic.ts';
import { cashOutMax, buildSettingsPatch } from '../functions/settings/handlers/_logic.ts';

function assert(cond: unknown, msg = 'assert'): asserts cond {
  if (!cond) throw new Error(msg);
}
function throwsCode(fn: () => unknown, code: string) {
  try { fn(); } catch (e) { assert((e as any).code === code, `expected ${code}, got ${(e as any).code}`); return; }
  throw new Error(`expected ${code}`);
}

Deno.test('a send prints one comanda per station and nothing for lines with no station', () => {
  const g = groupByStation([
    { id: 'a', station: 'kitchen', name: 'Flan' },
    { id: 'b', station: 'bar', name: 'Malbec' },
    { id: 'c', station: 'none', name: 'Agua' },
    { id: 'd', station: 'kitchen', name: 'Tabla' },
  ]);
  assert(g.get('cocina')?.length === 2 && g.get('barra')?.length === 1, 'grouping');
  assert(![...g.values()].flat().some((i) => i.id === 'c'), 'agua never prints');
});

Deno.test('a retried send never prints the same comanda twice', () => {
  // Same lines in another order = same job (the dedupe key sorts ids).
  assert(comandaDedupeKey('o1', 'cocina', [{ id: 'b' }, { id: 'a' }]) === comandaDedupeKey('o1', 'cocina', [{ id: 'a' }, { id: 'b' }]), 'same key');
  assert(comandaDedupeKey('o1', 'cocina', [{ id: 'a' }]) !== comandaDedupeKey('o1', 'cambio', [{ id: 'a' }]), 'cancel notice is its own job');
});

Deno.test('the comanda shows what to prepare and no prices; the cancel notice says what to stop', () => {
  const lines = buildComandaLines({
    kind: 'cocina', place: 'Mesa 4', when: '2026-10-14T03:05:00Z', by: 'Ana',
    items: [{ id: 'a', name: 'Flan', qty: 2, variant_label: 'Grande', modifiers: [{ label: 'sin azúcar' }], extras: [{ name: 'Helado' }], notes: 'para compartir' }],
  }).map((l) => l.text).join('\n');
  for (const want of ['COCINA', 'Mesa 4', '2 x Flan', 'Grande', 'sin azúcar', '+ Helado', 'Nota: para compartir', '21:05']) {
    assert(lines.includes(want), `missing ${want}`);
  }
  assert(!lines.includes('$'), 'no prices on a comanda');
  const cancel = buildComandaLines({ kind: 'cambio', station: 'barra', place: 'Mesa 4', when: '2026-10-14T03:05:00Z', items: [{ name: 'Malbec', qty: 1, cancel_reason: 'se equivocó' }] })
    .map((l) => l.text).join('\n');
  assert(cancel.includes('CANCELADO BARRA') && cancel.includes('- 1 x Malbec') && cancel.includes('Motivo: se equivocó'), cancel);
  // Every line fits a 58 mm ticket.
  assert(lines.split('\n').every((l) => l.length <= 32), 'width');
});

Deno.test('products with no station are delivered on send only when the bar turned it on', () => {
  assert(sendStatusFor('none', true) === 'entregado', 'auto deliver');
  assert(sendStatusFor(undefined, true) === 'entregado', 'missing station counts as none');
  assert(sendStatusFor('none', false) === 'enviado', 'off by default');
  assert(sendStatusFor('kitchen', true) === 'enviado' && sendStatusFor('bar', true) === 'enviado', 'stations still prepare');
});

Deno.test('a withdrawal over the bar cap is refused, even with approval; no cap means no limit', () => {
  // 2026-10-14: a $999,999.99 withdrawal went through with $500 in the drawer.
  throwsCode(() => assertCashOutWithinCap(100_001, 100_000), 'cash_out_over_cap');
  assertCashOutWithinCap(100_000, 100_000);
  assertCashOutWithinCap(99_999_999, 0);
  assertCashOutWithinCap(99_999_999, undefined);
});

Deno.test('the cap setting accepts $1 to $1,000,000 or empty (no cap)', () => {
  assert(cashOutMax(null) === 0 && cashOutMax('') === 0 && cashOutMax(0) === 0, 'empty = no cap');
  assert(cashOutMax(50_000) === 50_000, 'valid');
  throwsCode(() => cashOutMax(50), 'invalid_cash_out_max');
  throwsCode(() => cashOutMax(12.5), 'invalid_cash_out_max');
  throwsCode(() => cashOutMax('500'), 'invalid_cash_out_max');
  const patch = buildSettingsPatch({ print_comandas: true, auto_deliver_no_station: false, cash_out_max: 50_000 }, []);
  assert(patch.print_comandas === true && patch.auto_deliver_no_station === false && patch.cash_out_max === 50_000, JSON.stringify(patch));
  throwsCode(() => buildSettingsPatch({ print_comandas: 'yes' }, []), 'invalid_value');
});

Deno.test('only a live withdrawal of the open shift can be voided', () => {
  assert(cashOutVoidBlocker({ amount: -5000, shift_id: 's1' }, 's1') === null, 'ok');
  assert(cashOutVoidBlocker({ amount: -5000, shift_id: 's1', voided_at: 'x' }, 's1') === 'already_voided', 'twice');
  assert(cashOutVoidBlocker({ amount: 0, shift_id: 's1' }, 's1') === 'not_a_withdrawal', 'duplicate row');
  // Once the shift closed, its corte is final.
  assert(cashOutVoidBlocker({ amount: -5000, shift_id: 's0' }, 's1') === 'shift_closed', 'old shift');
  assert(cashOutVoidBlocker({ amount: -5000, shift_id: 's0' }, null) === 'shift_closed', 'no shift');
  assert(typeof LogicError === 'function');
});

import { needsQtyConfirm, qtyConfirmThreshold, DEFAULT_QTY_CONFIRM } from '../functions/orders/handlers/_logic.ts';

Deno.test('a line past the bar threshold asks "¿Seguro?" once; small and shrinking lines never ask', () => {
  // José, 2026-10-14: confirm above 20 pieces, configurable by the admin.
  assert(qtyConfirmThreshold(undefined) === DEFAULT_QTY_CONFIRM && DEFAULT_QTY_CONFIRM === 20, 'default 20');
  assert(qtyConfirmThreshold({ qty_confirm_threshold: 50 }) === 50, 'bar value');
  assert(qtyConfirmThreshold({ qty_confirm_threshold: 0 }) === 0, '0 kept');
  assert(needsQtyConfirm(21, 20), '21 asks');
  assert(!needsQtyConfirm(20, 20), '20 does not');
  assert(!needsQtyConfirm(1000, 20, 0, true), 'confirmed passes');
  assert(!needsQtyConfirm(1000, 0), '0 = never ask');
  // Lowering a big line, or editing notes on it, must not ask again.
  assert(!needsQtyConfirm(25, 20, 30), 'shrinking');
  assert(needsQtyConfirm(31, 20, 30), 'growing a big line asks');
  const patch = buildSettingsPatch({ qty_confirm_threshold: 30 }, []);
  assert(patch.qty_confirm_threshold === 30, 'saved');
  throwsCode(() => buildSettingsPatch({ qty_confirm_threshold: -1 }, []), 'invalid_qty_confirm');
  throwsCode(() => buildSettingsPatch({ qty_confirm_threshold: 1000 }, []), 'invalid_qty_confirm');
});

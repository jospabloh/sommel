// Cobro (contrato entrega 2, seccion 6, pantalla 2). Hoja inferior sobre la
// comanda. TODO el dinero lo calcula el servidor (`callFn('payments', ...)`):
// total, descuento, propina, division, cambio. Aqui solo se captura y se
// formatea. Nunca se escribe una entidad directo.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Percent, HandCoins, Printer, AlertTriangle } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { callFn, ApiError } from '@/lib/api';
import { usePermission } from '@/lib/usePermission';
import { formatMXN, pesosToCents } from '@/lib/money';
import { cn } from '@/lib/utils';
import CashKeypad from './CashKeypad';
import DiscountDialog from './DiscountDialog';
import TipDialog from './TipDialog';
import VoidPaymentDialog from './VoidPaymentDialog';
import PaymentsList from './PaymentsList';
import SplitSection from './SplitSection';
import { useAttemptKey } from './useAttemptKey';

function pesosString(cents) {
  return (cents / 100).toFixed(2).replace(/\.00$/, '');
}

export default function CobroPanel({ open, onOpenChange, orderId, onChanged }) {
  const { can } = usePermission();
  const canDiscount = can('Cobro:descuento');
  const canVoid = can('Cobro:anular_pago');

  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [noShift, setNoShift] = useState(false);
  const [lastChange, setLastChange] = useState(null); // server-confirmed change of the last cash payment

  const [methodKey, setMethodKey] = useState(null);
  const [received, setReceived] = useState('');
  const [amountStr, setAmountStr] = useState(null); // null = use the suggested amount

  const [mode, setMode] = useState('full');
  const [partsTotal, setPartsTotal] = useState(2);
  const [partsDone, setPartsDone] = useState(0);
  const [equalAmounts, setEqualAmounts] = useState([]);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [paidItemIds, setPaidItemIds] = useState(() => new Set());
  const [itemsAmount, setItemsAmount] = useState(null);

  const [discountOpen, setDiscountOpen] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);
  const [voidTarget, setVoidTarget] = useState(null);
  const [ticketBusy, setTicketBusy] = useState(false);

  const { keyFor, reset: resetKey } = useAttemptKey();

  const load = useCallback(async () => {
    if (!orderId) return;
    try {
      const res = await callFn('payments', 'summary', { order_id: orderId });
      setData(res);
      setLoadError('');
      if (res.shift_open) setNoShift(false);
    } catch (err) {
      setLoadError(err.message || 'No se pudo cargar el cobro');
    }
  }, [orderId]);

  useEffect(() => {
    if (!open) return;
    setLastChange(null);
    setMode('full');
    setPartsTotal(2);
    setPartsDone(0);
    setSelectedIds(new Set());
    setPaidItemIds(new Set());
    setAmountStr(null);
    setReceived('');
    load();
  }, [open, load]);

  const order = data?.order;
  const remaining = data?.remaining ?? 0;
  const methods = useMemo(() => data?.methods ?? [], [data]);
  const isOpenOrder = order?.status === 'abierta';
  const livePayments = (data?.payments ?? []).filter((p) => !p.voided_at);
  const hasLivePayments = livePayments.length > 0;
  const chargeableItems = useMemo(() => (data?.items ?? []).filter((i) => i.status !== 'cancelado'), [data]);

  const method = methods.find((m) => m.key === methodKey) ?? methods[0] ?? null;

  // Equal split: ask the server for the shares of what is still owed.
  const equalParts = partsTotal - partsDone;
  useEffect(() => {
    if (!open || mode !== 'equal' || !isOpenOrder || equalParts < 2 || remaining <= 0) {
      setEqualAmounts([]);
      return undefined;
    }
    let cancelled = false;
    callFn('payments', 'splitPreview', { order_id: orderId, mode: 'equal', parts: equalParts })
      .then((res) => !cancelled && setEqualAmounts(res.amounts || []))
      .catch(() => !cancelled && setEqualAmounts([]));
    return () => {
      cancelled = true;
    };
  }, [open, mode, isOpenOrder, equalParts, remaining, orderId]);

  // Split by dishes: the server prorates discount and tip.
  const selectedKey = Array.from(selectedIds).sort().join(',');
  useEffect(() => {
    if (!open || mode !== 'items' || !isOpenOrder || selectedIds.size === 0) {
      setItemsAmount(null);
      return undefined;
    }
    let cancelled = false;
    callFn('payments', 'splitPreview', { order_id: orderId, mode: 'items', item_ids: Array.from(selectedIds) })
      .then((res) => !cancelled && setItemsAmount(typeof res.amount === 'number' ? res.amount : null))
      .catch(() => !cancelled && setItemsAmount(null));
    return () => {
      cancelled = true;
    };
    // selectedKey stands in for selectedIds (a new Set each toggle).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, isOpenOrder, selectedKey, remaining, orderId]);

  let suggested = remaining;
  if (mode === 'equal') suggested = equalParts >= 2 ? equalAmounts[0] ?? remaining : remaining;
  if (mode === 'items') suggested = itemsAmount ?? 0;
  const amount = amountStr !== null ? pesosToCents(Number(amountStr) || 0) : suggested;

  const receivedCents = received === '' ? null : pesosToCents(Number(received) || 0);
  const cashShort = !!method?.is_cash && receivedCents !== null && receivedCents < amount;
  const estimatedChange = method?.is_cash && receivedCents !== null && receivedCents > amount ? receivedCents - amount : 0;
  const canPay = isOpenOrder && !!method && amount > 0 && amount <= remaining && !cashShort && !busy && data?.shift_open !== false;

  const resetEntry = () => {
    setReceived('');
    setAmountStr(null);
  };

  const handleModeChange = (next) => {
    setMode(next);
    setAmountStr(null);
    setSelectedIds(new Set());
    setItemsAmount(null);
    if (next === 'equal' && partsDone === 0) setPartsTotal((p) => Math.max(2, p));
  };

  const toggleItem = (id) => {
    setAmountStr(null);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const splitLabel = () => {
    if (mode === 'equal') return `Parte ${partsDone + 1} de ${partsTotal}`;
    if (mode === 'items') return 'Por platillos';
    return undefined;
  };

  const handlePay = async () => {
    if (!canPay) return;
    setBusy(true);
    try {
      const payload = {
        order_id: orderId,
        method: method.key,
        amount,
        idempotency_key: keyFor(orderId, method.key, amount),
      };
      if (method.is_cash && receivedCents !== null) payload.received = receivedCents;
      const label = splitLabel();
      if (label) payload.split_label = label;

      const res = await callFn('payments', 'addPayment', payload);
      resetKey();
      resetEntry();
      setNoShift(false);
      setLastChange(method.is_cash ? res.change ?? 0 : null);
      if (res.inventory_warning) {
        toast({ title: 'Cobro registrado', description: res.inventory_warning, variant: 'destructive' });
      }
      if (mode === 'equal') setPartsDone((d) => d + 1);
      if (mode === 'items') {
        setPaidItemIds((prev) => new Set([...prev, ...selectedIds]));
        setSelectedIds(new Set());
      }
      await load();
      onChanged?.();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'no_open_shift') {
        setNoShift(true);
      } else {
        // Same key is kept on purpose: a retry of this attempt cannot double charge.
        toast({ title: 'No se pudo cobrar', description: err.message, variant: 'destructive' });
      }
    } finally {
      setBusy(false);
    }
  };

  const runAdjust = async (action, payload, failTitle, done) => {
    setBusy(true);
    try {
      await callFn('payments', action, { order_id: orderId, ...payload });
      done?.();
      setAmountStr(null);
      await load();
      onChanged?.();
    } catch (err) {
      const hasPay = err instanceof ApiError && err.code === 'has_payments';
      toast({
        title: failTitle,
        description: hasPay ? 'Ya hay pagos registrados. Anúlalos primero.' : err.message,
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleVoid = async (reason) => {
    setBusy(true);
    try {
      await callFn('payments', 'voidPayment', { payment_id: voidTarget.id, reason });
      setVoidTarget(null);
      setLastChange(null);
      resetKey();
      await load();
      onChanged?.();
    } catch (err) {
      toast({ title: 'No se pudo anular', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const handleTicket = async () => {
    setTicketBusy(true);
    try {
      await callFn('payments', 'requestTicket', { order_id: orderId });
      toast({ title: 'Ticket enviado a la impresora' });
    } catch (err) {
      toast({ title: 'No se pudo pedir el ticket', description: err.message, variant: 'destructive' });
    } finally {
      setTicketBusy(false);
    }
  };

  const hasDiscount = (order?.discount ?? 0) > 0;
  const hasTip = (order?.tip ?? 0) > 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-2xl p-0">
        <div className="max-w-xl mx-auto p-4 sm:p-6 space-y-4">
          <SheetHeader className="text-left">
            <SheetTitle>Cobrar</SheetTitle>
            <SheetDescription className="sr-only">Cobro de la comanda</SheetDescription>
          </SheetHeader>

          {!data && !loadError && (
            <div className="flex justify-center py-10">
              <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" />
            </div>
          )}

          {loadError && (
            <div className="rounded-xl border border-destructive/50 bg-destructive/10 text-destructive text-sm px-4 py-3 space-y-2">
              <p>{loadError}</p>
              <Button variant="outline" size="sm" onClick={load}>
                Reintentar
              </Button>
            </div>
          )}

          {data && order && (
            <>
              {/* Total */}
              <div className="rounded-2xl border border-border bg-card p-4 text-center space-y-1">
                <div className="text-xs text-muted-foreground">Total</div>
                <div className="text-4xl font-display font-semibold">{formatMXN(order.total)}</div>
                {(hasDiscount || hasTip) && (
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <div>Subtotal {formatMXN(order.subtotal)}</div>
                    {hasDiscount && (
                      <div>
                        {order.discount_kind === 'cortesia' ? 'Cortesía' : 'Descuento'} -{formatMXN(order.discount)}
                        {order.discount_reason ? ` (${order.discount_reason})` : ''}
                      </div>
                    )}
                    {hasTip && <div>Propina {formatMXN(order.tip)}</div>}
                  </div>
                )}
                {isOpenOrder && (
                  <div className="text-sm pt-1">
                    Falta <span className="font-semibold">{formatMXN(remaining)}</span>
                  </div>
                )}
              </div>

              {order.status === 'cancelada' && (
                <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                  Esta comanda fue cancelada.
                </div>
              )}

              {order.status === 'cobrada' && (
                <div className="rounded-xl border border-[hsl(var(--chart-3))]/50 bg-[hsl(var(--chart-3))]/10 px-4 py-3 space-y-1">
                  <div className="flex items-center gap-2 font-medium text-[hsl(var(--chart-3))]">
                    <CheckCircle2 className="w-5 h-5" /> Cuenta cobrada
                  </div>
                  {lastChange !== null && lastChange > 0 && (
                    <div className="text-sm">
                      Entrega de cambio: <span className="font-semibold">{formatMXN(lastChange)}</span>
                    </div>
                  )}
                </div>
              )}

              {isOpenOrder && !noShift && lastChange !== null && lastChange > 0 && (
                <div className="rounded-xl border border-primary/50 bg-primary/10 px-4 py-3 text-sm">
                  Entrega de cambio: <span className="font-semibold">{formatMXN(lastChange)}</span>
                </div>
              )}

              {(noShift || data.shift_open === false) && isOpenOrder && (
                <div className="rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm space-y-2">
                  <div className="flex items-center gap-2 text-destructive font-medium">
                    <AlertTriangle className="w-4 h-4" /> Abre el turno antes de cobrar
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/turno">Ir a Turno</Link>
                  </Button>
                </div>
              )}

              {/* Descuento y propina */}
              {isOpenOrder && (
                <div className="flex gap-2">
                  {canDiscount && (
                    <Button
                      variant="outline"
                      className="flex-1 h-11"
                      disabled={busy || hasLivePayments}
                      onClick={() => setDiscountOpen(true)}
                    >
                      <Percent className="w-4 h-4" /> Descuento
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    className="flex-1 h-11"
                    disabled={busy || hasLivePayments}
                    onClick={() => setTipOpen(true)}
                  >
                    <HandCoins className="w-4 h-4" /> Propina
                  </Button>
                </div>
              )}
              {isOpenOrder && hasLivePayments && (
                <p className="text-xs text-muted-foreground -mt-2">
                  Con pagos registrados no se puede cambiar el descuento ni la propina.
                </p>
              )}

              {/* Cobro */}
              {isOpenOrder && remaining > 0 && (
                <>
                  <SplitSection
                    mode={mode}
                    onModeChange={handleModeChange}
                    disabled={busy}
                    partsTotal={partsTotal}
                    partsDone={partsDone}
                    onPartsChange={setPartsTotal}
                    equalAmounts={equalAmounts}
                    items={chargeableItems}
                    selectedIds={selectedIds}
                    paidItemIds={paidItemIds}
                    onToggleItem={toggleItem}
                    itemsAmount={itemsAmount}
                  />

                  <div className="space-y-1.5">
                    <Label htmlFor="cobro-amount">Monto a cobrar</Label>
                    <Input
                      id="cobro-amount"
                      inputMode="decimal"
                      value={amountStr !== null ? amountStr : pesosString(amount)}
                      onChange={(e) => setAmountStr(e.target.value.replace(/[^0-9.]/g, ''))}
                      className="h-12 text-lg"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Forma de pago</Label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {methods.map((m) => (
                        <button
                          key={m.key}
                          type="button"
                          onClick={() => {
                            setMethodKey(m.key);
                            setReceived('');
                          }}
                          className={cn(
                            'h-12 rounded-lg border text-sm font-medium active:scale-95',
                            method?.key === m.key
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border bg-card'
                          )}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {method?.is_cash && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-muted-foreground">Recibido</span>
                        <span className="text-2xl font-display font-semibold">
                          {received === '' ? '$0' : formatMXN(receivedCents)}
                        </span>
                      </div>
                      <CashKeypad
                        value={received}
                        onChange={setReceived}
                        onExact={() => setReceived(pesosString(amount))}
                        disabled={busy}
                      />
                      {cashShort && <p className="text-xs text-destructive">El efectivo recibido no alcanza.</p>}
                      {estimatedChange > 0 && (
                        <p className="text-sm">
                          Cambio: <span className="font-semibold">{formatMXN(estimatedChange)}</span>{' '}
                          <span className="text-xs text-muted-foreground">(el sistema lo confirma al cobrar)</span>
                        </p>
                      )}
                    </div>
                  )}

                  <Button className="w-full h-14 text-base" disabled={!canPay} onClick={handlePay}>
                    {busy ? 'Cobrando…' : `Cobrar ${formatMXN(amount)}`}
                  </Button>
                </>
              )}

              {isOpenOrder && remaining <= 0 && (order.total ?? 0) === 0 && (order.subtotal ?? 0) > 0 && (
                <Button
                  className="w-full h-14 text-base"
                  disabled={busy || !method || data.shift_open === false}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await callFn('payments', 'addPayment', {
                        order_id: orderId,
                        method: method.key,
                        amount: 0,
                        idempotency_key: keyFor(orderId, method.key, 0),
                      });
                      resetKey();
                      await load();
                      onChanged?.();
                    } catch (err) {
                      if (err instanceof ApiError && err.code === 'no_open_shift') setNoShift(true);
                      else toast({ title: 'No se pudo cerrar la cuenta', description: err.message, variant: 'destructive' });
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Cerrar cuenta sin cobro
                </Button>
              )}

              <PaymentsList payments={data.payments} canVoid={canVoid} onVoid={setVoidTarget} />

              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1 h-11" disabled={ticketBusy} onClick={handleTicket}>
                  <Printer className="w-4 h-4" /> {ticketBusy ? 'Enviando…' : 'Imprimir ticket'}
                </Button>
                {!isOpenOrder && (
                  <Button className="flex-1 h-11" onClick={() => onOpenChange(false)}>
                    Listo
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </SheetContent>

      <DiscountDialog
        open={discountOpen}
        onOpenChange={setDiscountOpen}
        hasDiscount={hasDiscount}
        submitting={busy}
        onConfirm={(payload) => runAdjust('applyDiscount', payload, 'No se pudo aplicar el descuento', () => setDiscountOpen(false))}
      />
      <TipDialog
        open={tipOpen}
        onOpenChange={setTipOpen}
        hasTip={hasTip}
        submitting={busy}
        onConfirm={(payload) => runAdjust('setTip', payload, 'No se pudo guardar la propina', () => setTipOpen(false))}
      />
      <VoidPaymentDialog
        open={!!voidTarget}
        onOpenChange={(v) => !v && setVoidTarget(null)}
        payment={voidTarget}
        reopens={order?.status === 'cobrada'}
        onConfirm={handleVoid}
        submitting={busy}
      />
    </Sheet>
  );
}

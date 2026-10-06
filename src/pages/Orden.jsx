// Comanda (contrato §5, pantallas 7 y 12). Dueño: agente Comandas UI.
// Sirve /orden/:orderId y /orden/nueva?tipo=llevar. Todo lo que cambia
// dinero, estado o inventario pasa por `callFn('orders', ...)` (contrato §1)
// — esta página nunca escribe `Order`/`OrderItem`/`BarTable` directo.
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Plus, Send, MoreVertical, Ban, Wallet } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { usePermission } from '@/lib/usePermission';
import { callFn, ApiError } from '@/lib/api';
import { toast } from '@/components/ui/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { formatMXN } from '@/lib/money';
import FixedBottomBar from '@/components/orders/FixedBottomBar';
import { useOrderRealtime } from '@/components/orders/useOrderRealtime';
import { flattenRow } from '@/components/orders/helpers';
import ProductPicker from '@/components/orders/ProductPicker';
import VariantModifierSheet from '@/components/orders/VariantModifierSheet';
import OrderLineItem from '@/components/orders/OrderLineItem';
import CancelItemDialog from '@/components/orders/CancelItemDialog';
import MoveMergeSheet from '@/components/orders/MoveMergeSheet';
import CobroPanel from '@/components/payments/CobroPanel';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

const REMOVE_UNDO_MS = 4000;

function NewTakeawayScreen() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return; // el servidor también lo exige (customer_name_required)
    setSubmitting(true);
    try {
      const { order } = await callFn('orders', 'open', { type: 'llevar', customer_name: name.trim() });
      navigate(`/orden/${order.id}`, { replace: true });
    } catch (err) {
      toast({ title: 'No se pudo abrir el pedido', description: err.message, variant: 'destructive' });
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 max-w-sm mx-auto pt-16">
      <button
        type="button"
        onClick={() => navigate('/mesas')}
        className="flex items-center gap-1.5 text-sm text-muted-foreground mb-6"
      >
        <ArrowLeft className="w-4 h-4" /> Mesas
      </button>
      <h1 className="text-2xl font-display font-semibold mb-1">Pedido para llevar</h1>
      <p className="text-sm text-muted-foreground mb-6">¿A nombre de quién es?</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre del cliente"
          autoFocus
          required
        />
        <Button type="submit" className="w-full h-12" disabled={submitting || !name.trim()}>
          {submitting ? 'Abriendo…' : 'Abrir pedido'}
        </Button>
      </form>
    </div>
  );
}

export default function Orden() {
  const { orderId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { can } = usePermission();
  const tenantId = user?.tenant_id ?? null;

  const isNew = orderId === 'nueva';
  const { order, items, loading, notFound, reload, setItems } = useOrderRealtime(orderId);

  const [tables, setTables] = useState([]);
  const [otherOrders, setOtherOrders] = useState([]);
  const [addOpen, setAddOpen] = useState(false);
  const [configuring, setConfiguring] = useState(null); // product being sized/modified
  const [addingLine, setAddingLine] = useState(false);
  const [sending, setSending] = useState(false);
  const [moveMergeOpen, setMoveMergeOpen] = useState(false);
  const [moveMergeBusy, setMoveMergeBusy] = useState(false);
  const [cancelItemTarget, setCancelItemTarget] = useState(null);
  const [cancelItemBusy, setCancelItemBusy] = useState(false);
  const [cancelOrderOpen, setCancelOrderOpen] = useState(false);
  const [cancelOrderReason, setCancelOrderReason] = useState('');
  const [cancelOrderBusy, setCancelOrderBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState({});
  const [hiddenIds, setHiddenIds] = useState(() => new Set());
  const [cobroOpen, setCobroOpen] = useState(false);

  const canEdit = can('Comandas:tomar');
  const canCancelSent = can('Comandas:cancelar_enviado');
  const canMoveMerge = can('Comandas:mover_mesas');
  const canCancelOrder = can('Comandas:cancelar_orden');
  const canCobrar = can('Cobro:cobrar');

  const loadTablesAndOtherOrders = useCallback(async () => {
    if (!tenantId || isNew) return;
    const [tableRows, orderRows] = await Promise.all([
      base44.entities.BarTable.filter({ tenant_id: tenantId }),
      base44.entities.Order.filter({ tenant_id: tenantId, status: 'abierta' }),
    ]);
    setTables((tableRows || []).map(flattenRow).filter(Boolean));
    setOtherOrders((orderRows || []).map(flattenRow).filter(Boolean));
  }, [tenantId, isNew]);

  useEffect(() => {
    loadTablesAndOtherOrders();
  }, [loadTablesAndOtherOrders]);

  const visibleItems = useMemo(() => items.filter((i) => !hiddenIds.has(i.id)), [items, hiddenIds]);
  const unsentCount = visibleItems.filter((i) => i.status === 'nuevo').length;
  // Server total (includes discount and tip, refreshed by the Order subscription);
  // the line sum is only a fallback until the order row carries a total.
  const lineSum = visibleItems.reduce((sum, i) => (i.status === 'cancelado' ? sum : sum + i.unit_price * i.qty), 0);
  const total = typeof order?.total === 'number' ? order.total : lineSum;

  const tableLabel = useMemo(() => {
    if (!order || order.type !== 'mesa') return null;
    const names = (order.table_ids ?? []).map((id) => tables.find((t) => t.id === id)?.name).filter(Boolean);
    return names.join(' + ') || 'Mesa';
  }, [order, tables]);

  const withRowBusy = useCallback(async (id, fn) => {
    setRowBusy((prev) => ({ ...prev, [id]: true }));
    try {
      await fn();
    } finally {
      setRowBusy((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  }, []);

  const handlePickProduct = (product) => setConfiguring(product);

  const handleAddConfirm = async (payload) => {
    setAddingLine(true);
    try {
      const { items: created } = await callFn('orders', 'addItems', {
        order_id: order.id,
        items: [payload],
      });
      setItems((prev) => [...prev, ...(created || []).map(flattenRow).filter(Boolean)]);
      setConfiguring(null);
      setAddOpen(false);
    } catch (err) {
      toast({ title: 'No se pudo agregar', description: err.message, variant: 'destructive' });
    } finally {
      setAddingLine(false);
    }
  };

  const mergeItem = (updated) => {
    const row = flattenRow(updated);
    if (!row) return;
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.id === row.id);
      if (idx === -1) return [...prev, row];
      const next = prev.slice();
      next[idx] = { ...next[idx], ...row };
      return next;
    });
  };

  const handleQtyChange = (item, qty) => {
    if (qty < 1) return; // trash icon is the deliberate "remove entirely" action
    withRowBusy(item.id, async () => {
      try {
        const { item: updated } = await callFn('orders', 'updateItem', { item_id: item.id, qty });
        mergeItem(updated);
      } catch (err) {
        toast({ title: 'No se pudo actualizar la cantidad', description: err.message, variant: 'destructive' });
      }
    });
  };

  const handleRemove = (item) => {
    // Optimistic hide + "Deshacer" toast (contrato §5) — the real delete only
    // fires after the window closes, so undo never has to reconstruct a row.
    setHiddenIds((prev) => new Set(prev).add(item.id));
    const timer = setTimeout(async () => {
      try {
        await callFn('orders', 'removeItem', { item_id: item.id });
        setItems((prev) => prev.filter((i) => i.id !== item.id));
      } catch (err) {
        toast({ title: 'No se pudo quitar el renglón', description: err.message, variant: 'destructive' });
      } finally {
        setHiddenIds((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
      }
    }, REMOVE_UNDO_MS);

    toast({
      title: `${item.name} quitado`,
      action: (
        <ToastAction
          altText="Deshacer"
          onClick={() => {
            clearTimeout(timer);
            setHiddenIds((prev) => {
              const next = new Set(prev);
              next.delete(item.id);
              return next;
            });
          }}
        >
          Deshacer
        </ToastAction>
      ),
    });
  };

  const handleSend = async () => {
    setSending(true);
    try {
      const { sent } = await callFn('orders', 'send', { order_id: order.id });
      (sent || []).forEach((row) => mergeItem(row));
      toast({ title: 'Enviado a cocina y barra' });
    } catch (err) {
      toast({ title: 'No se pudo enviar', description: err.message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const handleCancelItemConfirm = async ({ reason, prepared }) => {
    setCancelItemBusy(true);
    try {
      const { item: updated } = await callFn('orders', 'cancelItem', {
        item_id: cancelItemTarget.id,
        reason,
        prepared,
      });
      mergeItem(updated);
      setCancelItemTarget(null);
    } catch (err) {
      toast({ title: 'No se pudo cancelar el renglón', description: err.message, variant: 'destructive' });
    } finally {
      setCancelItemBusy(false);
    }
  };

  const freeTables = useMemo(() => tables.filter((t) => t.status !== 'occupied'), [tables]);
  const mergeCandidates = useMemo(
    () =>
      otherOrders
        .filter((o) => o.id !== order?.id)
        .map((o) => ({ ...o, table_label: (o.table_ids ?? []).map((id) => tables.find((t) => t.id === id)?.name).filter(Boolean).join(' + ') })),
    [otherOrders, order, tables]
  );

  const handleMove = async (toTableId) => {
    setMoveMergeBusy(true);
    try {
      await callFn('orders', 'moveTable', { order_id: order.id, to_table_id: toTableId });
      setMoveMergeOpen(false);
      toast({ title: 'Comanda movida' });
      // The hook's own subscription picks up Order changes; these local
      // reloads keep the header's table name and the free-table list in
      // sync immediately too, instead of waiting on BarTable's own socket
      // (which this page, unlike Mesas.jsx, doesn't subscribe to).
      reload();
      loadTablesAndOtherOrders();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'table_busy') {
        // Fixed 2026-09-28: the server now sends order_id structured
        // (HttpError.extra) instead of only inside the message text, so the
        // loser of the race can jump straight to the order that won it.
        const existingOrderId = err.data?.order_id;
        toast({
          title: 'Esa mesa ya se ocupó',
          description: 'Elige otra.',
          action: existingOrderId ? (
            <ToastAction altText="Ver comanda" onClick={() => navigate(`/orden/${existingOrderId}`)}>
              Ver comanda
            </ToastAction>
          ) : undefined,
        });
      } else {
        toast({ title: 'No se pudo mover', description: err.message, variant: 'destructive' });
      }
    } finally {
      setMoveMergeBusy(false);
    }
  };

  const handleMerge = async (fromOrderId) => {
    setMoveMergeBusy(true);
    try {
      await callFn('orders', 'mergeOrders', { into_order_id: order.id, from_order_id: fromOrderId });
      setMoveMergeOpen(false);
      toast({ title: 'Comandas unidas' });
      reload();
      loadTablesAndOtherOrders();
    } catch (err) {
      toast({ title: 'No se pudo unir', description: err.message, variant: 'destructive' });
    } finally {
      setMoveMergeBusy(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!cancelOrderReason.trim()) return;
    setCancelOrderBusy(true);
    try {
      await callFn('orders', 'cancelOrder', { order_id: order.id, reason: cancelOrderReason.trim() });
      toast({ title: 'Comanda cancelada' });
      navigate('/mesas');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'has_payments') {
        toast({ title: 'No se puede cancelar', description: 'Ya tiene pagos registrados.', variant: 'destructive' });
      } else {
        toast({ title: 'No se pudo cancelar', description: err.message, variant: 'destructive' });
      }
    } finally {
      setCancelOrderBusy(false);
      setCancelOrderOpen(false);
    }
  };

  if (isNew) {
    const tipo = searchParams.get('tipo');
    if (tipo !== 'llevar') {
      navigate('/mesas', { replace: true });
      return null;
    }
    return <NewTakeawayScreen />;
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !order) {
    return (
      <div className="p-6 text-center text-muted-foreground pt-16">
        <p className="mb-4">Esta comanda ya no está disponible.</p>
        <Button variant="outline" onClick={() => navigate('/mesas')}>
          Volver a mesas
        </Button>
      </div>
    );
  }

  const closed = order.status !== 'abierta';

  return (
    <div className="flex flex-col h-full min-h-screen">
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3 flex items-center gap-3">
        <button type="button" onClick={() => navigate('/mesas')} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-muted shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="font-display font-semibold truncate">
            {order.type === 'llevar' ? order.customer_name || 'Para llevar' : tableLabel}
          </div>
          <div className="text-xs text-muted-foreground">
            {order.type === 'llevar' ? 'Para llevar' : 'Mesa'} · {order.status === 'abierta' ? 'Abierta' : order.status}
          </div>
        </div>
        {!closed && (canMoveMerge || canCancelOrder) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-muted shrink-0">
                <MoreVertical className="w-5 h-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canMoveMerge && <DropdownMenuItem onClick={() => setMoveMergeOpen(true)}>Mover / unir mesas</DropdownMenuItem>}
              {canCancelOrder && (
                <DropdownMenuItem className="text-destructive" onClick={() => setCancelOrderOpen(true)}>
                  <Ban className="w-4 h-4 mr-2" /> Cancelar comanda
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2.5 pb-[calc(var(--bottom-bar-h,8rem)+1rem)]">
        {closed && (
          <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            Esta comanda ya no está abierta.
            {order.status === 'cobrada' && canCobrar && (
              <Button variant="outline" size="sm" className="ml-3" onClick={() => setCobroOpen(true)}>
                Ver cobro
              </Button>
            )}
          </div>
        )}
        {visibleItems.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            Sin renglones todavía. Toca "Agregar" para empezar.
          </div>
        ) : (
          visibleItems.map((item) => (
            <OrderLineItem
              key={item.id}
              item={item}
              canEdit={canEdit && !closed}
              canCancel={canCancelSent && !closed}
              busy={!!rowBusy[item.id]}
              onQtyChange={handleQtyChange}
              onRemove={handleRemove}
              onCancel={setCancelItemTarget}
            />
          ))
        )}
      </div>

      {!closed && (
        <FixedBottomBar>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <span className="text-sm text-muted-foreground">Total</span>
            <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
              <span className="text-xl font-display font-semibold">{formatMXN(total)}</span>
              {canCobrar && visibleItems.length > 0 && (
                <Button className="h-10" onClick={() => setCobroOpen(true)}>
                  <Wallet className="w-4 h-4 mr-1.5" /> Cobrar
                </Button>
              )}
            </div>
          </div>
          <div className="flex gap-2.5">
            {canEdit && (
              <Button variant="outline" className="h-12 min-w-0 flex-1 px-3" onClick={() => setAddOpen(true)}>
                <Plus className="w-4 h-4 mr-1.5" /> Agregar
              </Button>
            )}
            {canEdit && (
              // Etiqueta más corta (fixed 2026-09-28): "Enviar a cocina y
              // barra" con su ícono no cabía en el botón flex-1 a 390px de
              // ancho (el sidebar de w-20 siempre visible deja ~310px para
              // los dos botones) y se recortaba o se encimaba con "Agregar".
              <Button className="h-12 min-w-0 flex-1 px-3" onClick={handleSend} disabled={sending || unsentCount === 0}>
                <Send className="w-4 h-4 mr-1.5" /> {sending ? 'Enviando…' : 'Enviar'}
              </Button>
            )}
          </div>
        </FixedBottomBar>
      )}

      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader className="text-left">
            <SheetTitle>Agregar al pedido</SheetTitle>
          </SheetHeader>
          <div className="mt-3">
            <ProductPicker onPick={handlePickProduct} />
          </div>
        </SheetContent>
      </Sheet>

      <VariantModifierSheet
        product={configuring}
        open={!!configuring}
        onOpenChange={(v) => !v && setConfiguring(null)}
        onConfirm={handleAddConfirm}
        submitting={addingLine}
      />

      <CancelItemDialog
        open={!!cancelItemTarget}
        onOpenChange={(v) => !v && setCancelItemTarget(null)}
        item={cancelItemTarget}
        onConfirm={handleCancelItemConfirm}
        submitting={cancelItemBusy}
      />

      <MoveMergeSheet
        open={moveMergeOpen}
        onOpenChange={setMoveMergeOpen}
        order={order}
        freeTables={freeTables}
        mergeCandidates={mergeCandidates}
        onMove={handleMove}
        onMerge={handleMerge}
        submitting={moveMergeBusy}
      />

      {canCobrar && (
        <CobroPanel open={cobroOpen} onOpenChange={setCobroOpen} orderId={order.id} onChanged={loadTablesAndOtherOrders} />
      )}

      <Dialog open={cancelOrderOpen} onOpenChange={setCancelOrderOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cancelar comanda</DialogTitle>
          </DialogHeader>
          <Textarea
            value={cancelOrderReason}
            onChange={(e) => setCancelOrderReason(e.target.value)}
            placeholder="Motivo de la cancelación"
            rows={3}
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelOrderOpen(false)}>
              Volver
            </Button>
            <Button variant="destructive" onClick={handleCancelOrder} disabled={!cancelOrderReason.trim() || cancelOrderBusy}>
              {cancelOrderBusy ? 'Cancelando…' : 'Cancelar comanda'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

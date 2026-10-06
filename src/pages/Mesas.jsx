// Mapa de mesas (contrato §5, pantalla 1). Dueño: agente Comandas UI.
// Lecturas directas de BarTable/Order están permitidas (contrato §1); solo
// Product exige pasar por `catalog`. Nada aquí escribe entidades directo —
// abrir/mover una comanda siempre pasa por `orders` (contrato §4).
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ShoppingBag, RotateCw } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { usePermission } from '@/lib/usePermission';
import { callFn, ApiError } from '@/lib/api';
import { toast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { formatMXN } from '@/lib/money';
import TableMap from '@/components/orders/TableMap';
import TableFormDialog from '@/components/orders/TableFormDialog';
import { flattenRow, flattenEvent } from '@/components/orders/helpers';

export default function Mesas() {
  const { user } = useAuth();
  const { can } = usePermission();
  const navigate = useNavigate();
  const tenantId = user?.tenant_id ?? null;

  const [tables, setTables] = useState([]);
  const [openOrders, setOpenOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openingTableId, setOpeningTableId] = useState(null);
  const [editingTable, setEditingTable] = useState(undefined); // undefined = closed, null = new, row = edit

  const canEditTables = can('Mesas:editar');
  const canTakeOrders = can('Comandas:tomar');

  const load = useCallback(async () => {
    if (!tenantId) {
      setTables([]);
      setOpenOrders([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [tableRows, orderRows] = await Promise.all([
        base44.entities.BarTable.filter({ tenant_id: tenantId }),
        base44.entities.Order.filter({ tenant_id: tenantId, status: 'abierta' }),
      ]);
      setTables((tableRows || []).map(flattenRow).filter(Boolean));
      setOpenOrders((orderRows || []).map(flattenRow).filter(Boolean));
    } catch (err) {
      toast({ title: 'No se pudo cargar el mapa de mesas', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  // Tiempo real: nueva mesa ocupada, comanda cerrada/movida, etc. (contrato §5).
  useEffect(() => {
    if (!tenantId) return undefined;

    const unsubTables = base44.entities.BarTable.subscribe((evt) => {
      const row = flattenEvent(evt);
      if (!row?.id || row.tenant_id !== tenantId) {
        if (evt.type === 'delete') setTables((prev) => prev.filter((t) => t.id !== evt.id));
        return;
      }
      setTables((prev) => {
        if (evt.type === 'delete') return prev.filter((t) => t.id !== row.id);
        const idx = prev.findIndex((t) => t.id === row.id);
        if (idx === -1) return [...prev, row];
        const next = prev.slice();
        next[idx] = row;
        return next;
      });
    });

    const unsubOrders = base44.entities.Order.subscribe((evt) => {
      const row = flattenEvent(evt);
      if (!row?.id) return;
      setOpenOrders((prev) => {
        const idx = prev.findIndex((o) => o.id === row.id);
        const stillOpen = row.tenant_id === tenantId && row.status === 'abierta' && evt.type !== 'delete';
        if (!stillOpen) return idx === -1 ? prev : prev.filter((o) => o.id !== row.id);
        if (idx === -1) return [...prev, row];
        const next = prev.slice();
        next[idx] = row;
        return next;
      });
    });

    return () => {
      unsubTables();
      unsubOrders();
    };
  }, [tenantId]);

  const orderByTable = useMemo(() => {
    const map = new Map();
    for (const order of openOrders) {
      for (const tableId of order.table_ids ?? []) {
        map.set(tableId, order);
      }
    }
    return map;
  }, [openOrders]);

  const awayOrders = useMemo(
    () => openOrders.filter((o) => o.type === 'llevar').sort((a, b) => (a.opened_at < b.opened_at ? 1 : -1)),
    [openOrders]
  );

  const handleTapTable = async (table) => {
    const existing = orderByTable.get(table.id);
    if (existing) {
      navigate(`/orden/${existing.id}`);
      return;
    }
    if (!canTakeOrders) {
      toast({ title: 'No tienes permiso para abrir comandas', variant: 'destructive' });
      return;
    }
    setOpeningTableId(table.id);
    try {
      const { order } = await callFn('orders', 'open', { type: 'mesa', table_id: table.id });
      navigate(`/orden/${order.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'table_busy') {
        // Fixed 2026-09-28: order_id now travels structured on the error
        // (HttpError.extra), so the loser of the race jumps straight to the
        // order that won it instead of just reloading and re-tapping.
        const existingOrderId = err.data?.order_id;
        if (existingOrderId) {
          navigate(`/orden/${existingOrderId}`);
        } else {
          toast({ title: 'Esa mesa ya se ocupó', description: 'Alguien más la abrió justo ahora.' });
          load();
        }
      } else {
        toast({ title: 'No se pudo abrir la mesa', description: err.message, variant: 'destructive' });
      }
    } finally {
      setOpeningTableId(null);
    }
  };

  const handleParaLlevar = () => {
    navigate('/orden/nueva?tipo=llevar');
  };

  if (!tenantId) {
    return <div className="p-6 text-muted-foreground">No perteneces a ningún bar todavía.</div>;
  }

  return (
    <div className="p-4 sm:p-6 pb-24 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-display font-semibold">Mesas</h1>
          <p className="text-sm text-muted-foreground">Toca una mesa libre para abrir comanda, u ocupada para verla.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" size="icon" onClick={load} aria-label="Actualizar">
            <RotateCw className="w-4 h-4" />
          </Button>
          {canEditTables && (
            <Button variant="outline" size="sm" onClick={() => setEditingTable(null)}>
              <Plus className="w-4 h-4 mr-1.5" /> Mesa
            </Button>
          )}
        </div>
      </div>

      {canTakeOrders && (
        <Button
          className="w-full mb-5 h-14 text-base"
          size="lg"
          onClick={handleParaLlevar}
        >
          <ShoppingBag className="w-5 h-5 mr-2" /> Pedido para llevar
        </Button>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {tables.length === 0 ? (
            <div className="text-center py-14 text-muted-foreground border border-dashed border-border rounded-2xl">
              Todavía no hay mesas.{' '}
              {canEditTables ? 'Agrega la primera con el botón de arriba.' : 'Pide a un administrador que las agregue.'}
            </div>
          ) : (
            <TableMap
              tables={tables}
              orderByTable={orderByTable}
              onTapTable={handleTapTable}
              onEditTable={(t) => setEditingTable(t)}
              canEdit={canEditTables}
            />
          )}
          {openingTableId && (
            <p className="text-xs text-muted-foreground mt-2 animate-pulse">Abriendo comanda…</p>
          )}

          {awayOrders.length > 0 && (
            <div className="mt-8">
              <h2 className="text-sm font-medium text-muted-foreground mb-2">Para llevar, abiertos</h2>
              <div className="space-y-2">
                {awayOrders.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => navigate(`/orden/${o.id}`)}
                    className="w-full flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left hover:border-primary/50 active:scale-[0.99]"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{o.customer_name || 'Sin nombre'}</div>
                      <div className="text-xs text-muted-foreground">Para llevar</div>
                    </div>
                    <div className="text-sm font-medium shrink-0">{formatMXN(o.total)}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <TableFormDialog
        open={editingTable !== undefined}
        onOpenChange={(v) => !v && setEditingTable(undefined)}
        table={editingTable}
        onSaved={(saved) => {
          const row = flattenRow(saved);
          setTables((prev) => {
            const idx = prev.findIndex((t) => t.id === row.id);
            if (idx === -1) return [...prev, row];
            const next = prev.slice();
            next[idx] = row;
            return next;
          });
        }}
        onDeleted={(id) => setTables((prev) => prev.filter((t) => t.id !== id))}
      />
    </div>
  );
}

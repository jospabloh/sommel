// Pantalla de estación (cocina / barra) — contrato §5, pantallas 3 y 8.
// Sirve /estacion/:station ('kitchen' | 'bar' | 'todo'; 'todo' = cocina y
// barra en una sola pantalla, docs/modo-terminal-diseno.md). Dueño: agente "Estaciones UI"
// (src/pages/Estacion.jsx + src/components/stations/**).
//
// Lecturas directas de OrderItem/Order/BarTable/WineBar están permitidas por
// el contrato §1 (nada aquí es Product, la única entidad que exige pasar por
// una Safe function para leer). Toda escritura pasa por `stations`
// (markReady/markDelivered/undoReady).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { RotateCw } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { usePermission } from '@/lib/usePermission';
import { callFn, ApiError } from '@/lib/api';
import { toast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import StationTicket from '@/components/stations/StationTicket';
import {
  COMBINED_VIEW,
  STATION_PERMISSION,
  STATION_TITLES,
  VIEW_TITLES,
  flattenRow,
  flattenEvent,
  groupItemsByOrder,
  linesForFilter,
  normalizeCombinedFilter,
  stationsForView,
} from '@/components/stations/stationHelpers';

// El reloj de la pantalla avanza cada 30 s (contrato §5) — no en cada render
// ni con un timer más rápido, para que la barra de calor "salte" en pasos
// visibles en vez de recalcular constantemente sin que nadie lo note.
const CLOCK_TICK_MS = 30 * 1000;

// The combined view's filter is remembered per device: a counter that only
// does drinks at night keeps "Barra" without choosing it every shift.
const FILTER_KEY = 'sommel-station-filter';

function readFilter() {
  try {
    return normalizeCombinedFilter(localStorage.getItem(FILTER_KEY));
  } catch {
    return 'all';
  }
}

const FILTER_LABELS = { all: 'Todo', ...STATION_TITLES };

export default function Estacion() {
  const { station } = useParams();
  const { user } = useAuth();
  const { can } = usePermission();
  const tenantId = user?.tenant_id ?? null;
  // Cocina and barra are separate permissions (2026-10-06, phase 3). Anyone in
  // the bar may look at either queue; only the station's key gets the buttons.
  // The server checks the same key per line (stations/handlers/_access.ts).
  const canOperate = useCallback((st) => can(STATION_PERMISSION[st]), [can]);

  const [bar, setBar] = useState(null);
  const [orders, setOrders] = useState([]);
  const [tables, setTables] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const [ackedCancelled, setAckedCancelled] = useState(() => new Set());
  const [busyIds, setBusyIds] = useState(() => new Set());
  const [filter, setFilterState] = useState(readFilter);

  const isCombined = station === COMBINED_VIEW;
  // A string key keeps the effects below from re-running on every render.
  const stationKey = stationsForView(station).join(',');
  const validStation = stationKey.length > 0;

  const setFilter = useCallback((value) => {
    const next = normalizeCombinedFilter(value);
    setFilterState(next);
    try {
      localStorage.setItem(FILTER_KEY, next);
    } catch {
      // storage blocked: the filter still works for this visit
    }
  }, []);

  const setBusy = useCallback((ids, on) => {
    setBusyIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    if (!tenantId || !validStation) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [{ bar: barConfig }, orderRows, tableRows, itemRows] = await Promise.all([
        // Fixed 2026-09-28: `WineBar.get` never worked for a normal user —
        // verified live, the entity-side RLS rule `{"id":
        // "{{user.data.tenant_id}}"}` never matches a flat row, so this
        // always resolved to nothing. Not loosened; routed through the
        // `stations.getConfig` server action instead, which reads `ctx.bar`
        // (loaded via asServiceRole) and hands back only what this screen
        // needs (contract §4).
        callFn('stations', 'getConfig'),
        base44.entities.Order.filter({ tenant_id: tenantId, status: 'abierta' }),
        base44.entities.BarTable.filter({ tenant_id: tenantId }),
        // Fixed 2026-09-28: this used to fetch EVERY OrderItem this station
        // ever had (no status/date bound) and discard the historical ones
        // client-side — fine on day one, expensive after weeks in service.
        // Only 'enviado'/'listo'/'cancelado' lines are ever displayed here
        // (a ticket only renders for an order still in `orders`, which is
        // already scoped to status:'abierta' above); 'nuevo' hasn't been
        // sent yet and 'entregado' is done, so both are excluded from the
        // fetch itself instead of only from the render.
        base44.entities.OrderItem.filter({
          tenant_id: tenantId,
          station: { $in: stationKey.split(',') },
          status: { $in: ['enviado', 'listo', 'cancelado'] },
        }),
      ]);
      setBar(barConfig || null);
      setOrders((orderRows || []).map(flattenRow).filter(Boolean));
      setTables((tableRows || []).map(flattenRow).filter(Boolean));
      setItems((itemRows || []).map(flattenRow).filter(Boolean));
    } catch (err) {
      toast({ title: 'No se pudo cargar la estación', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [tenantId, stationKey, validStation]);

  useEffect(() => {
    load();
  }, [load]);

  // Reloj de 30 s (contrato §5): recalcula las barras de calor sin recargar.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), CLOCK_TICK_MS);
    return () => clearInterval(t);
  }, []);

  // Tiempo real (contrato §5: "Real-time via base44.entities.OrderItem.subscribe").
  // `subscribe()` no filtra en el servidor — llega todo el tráfico de la
  // entidad — así que el filtrado a este inquilino/estación pasa aquí,
  // igual que useOrderRealtime.js hace para la pantalla de Orden.
  useEffect(() => {
    if (!tenantId || !validStation) return undefined;
    const shown = stationKey.split(',');

    const unsubItems = base44.entities.OrderItem.subscribe((evt) => {
      const row = flattenEvent(evt);
      if (!row?.id) return;
      setItems((prev) => {
        const idx = prev.findIndex((i) => i.id === row.id);
        const belongsHere = row.tenant_id === tenantId && shown.includes(row.station) && evt.type !== 'delete';
        if (!belongsHere) return idx === -1 ? prev : prev.filter((i) => i.id !== row.id);
        if (idx === -1) return [...prev, row];
        const next = prev.slice();
        next[idx] = { ...next[idx], ...row };
        return next;
      });
    });

    const unsubOrders = base44.entities.Order.subscribe((evt) => {
      const row = flattenEvent(evt);
      if (!row?.id) return;
      setOrders((prev) => {
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
      unsubItems();
      unsubOrders();
    };
  }, [tenantId, stationKey, validStation]);

  const tablesById = useMemo(() => {
    const map = new Map();
    for (const t of tables) map.set(t.id, t);
    return map;
  }, [tables]);

  const ordersById = useMemo(() => {
    const map = new Map();
    for (const o of orders) map.set(o.id, o);
    return map;
  }, [orders]);

  const activeFilter = isCombined ? filter : 'all';
  const grouped = useMemo(
    () => groupItemsByOrder(linesForFilter(items, activeFilter)),
    [items, activeFilter]
  );
  const emptyLabel = activeFilter === 'all' ? VIEW_TITLES[station] : FILTER_LABELS[activeFilter];

  // Tickets ordenados por hora de entrada — el que lleva más tiempo esperando
  // arriba, que es justo el que más urge que alguien vea.
  const tickets = useMemo(() => {
    const list = [];
    for (const [orderId, lines] of grouped.entries()) {
      const order = ordersById.get(orderId);
      // Sin la orden (cerrada/cancelada) no hay dónde mostrarlo — no debería
      // pasar en flujo normal, pero no truena la pantalla si pasa.
      if (!order) continue;
      list.push({ orderId, order, lines });
    }
    list.sort((a, b) => {
      const aTime = a.lines.reduce((min, l) => (l.sent_at && (!min || l.sent_at < min) ? l.sent_at : min), null) || '';
      const bTime = b.lines.reduce((min, l) => (l.sent_at && (!min || l.sent_at < min) ? l.sent_at : min), null) || '';
      return aTime.localeCompare(bTime);
    });
    return list;
  }, [grouped, ordersById]);

  const acknowledgeCancelled = useCallback((itemId) => {
    setAckedCancelled((prev) => {
      const next = new Set(prev);
      next.add(itemId);
      return next;
    });
  }, []);

  const applyUpdatedItems = useCallback((updated) => {
    setItems((prev) => {
      const next = prev.slice();
      for (const raw of updated) {
        const row = flattenRow(raw);
        if (!row?.id) continue;
        const idx = next.findIndex((i) => i.id === row.id);
        if (idx === -1) next.push(row);
        else next[idx] = { ...next[idx], ...row };
      }
      return next;
    });
  }, []);

  const handleMarkReady = useCallback(
    async (item) => {
      setBusy([item.id], true);
      try {
        const { items: updated } = await callFn('stations', 'markReady', { item_ids: [item.id] });
        applyUpdatedItems(updated || []);
      } catch (err) {
        toast({ title: 'No se pudo marcar listo', description: err.message, variant: 'destructive' });
      } finally {
        setBusy([item.id], false);
      }
    },
    [applyUpdatedItems, setBusy]
  );

  const handleMarkAllReady = useCallback(
    async (orderId, pendingItems) => {
      const ids = pendingItems.map((i) => i.id);
      setBusy(ids, true);
      try {
        const { items: updated } = await callFn('stations', 'markReady', { item_ids: ids });
        applyUpdatedItems(updated || []);
      } catch (err) {
        toast({ title: 'No se pudo marcar la orden lista', description: err.message, variant: 'destructive' });
      } finally {
        setBusy(ids, false);
      }
    },
    [applyUpdatedItems, setBusy]
  );

  const handleMarkDelivered = useCallback(
    async (item) => {
      setBusy([item.id], true);
      try {
        const { items: updated } = await callFn('stations', 'markDelivered', { item_ids: [item.id] });
        applyUpdatedItems(updated || []);
      } catch (err) {
        toast({ title: 'No se pudo marcar entregado', description: err.message, variant: 'destructive' });
      } finally {
        setBusy([item.id], false);
      }
    },
    [applyUpdatedItems, setBusy]
  );

  const handleUndo = useCallback(
    async (item) => {
      setBusy([item.id], true);
      try {
        const { item: updated } = await callFn('stations', 'undoReady', { item_id: item.id });
        applyUpdatedItems([updated]);
      } catch (err) {
        if (err instanceof ApiError && err.code === 'too_late') {
          toast({ title: 'Ya pasaron más de 5 minutos', description: 'Ya no se puede deshacer este renglón.' });
        } else {
          toast({ title: 'No se pudo deshacer', description: err.message, variant: 'destructive' });
        }
      } finally {
        setBusy([item.id], false);
      }
    },
    [applyUpdatedItems, setBusy]
  );

  if (!validStation) {
    return (
      <div className="p-6 text-muted-foreground">
        Estación desconocida. Usa <span className="font-mono">/estacion/kitchen</span>,{' '}
        <span className="font-mono">/estacion/bar</span> o <span className="font-mono">/estacion/todo</span>.
      </div>
    );
  }

  if (!tenantId) {
    return <div className="p-6 text-muted-foreground">No perteneces a ningún bar todavía.</div>;
  }

  return (
    <div className="p-4 sm:p-6 pb-24 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-5">
        <h1 className="font-display text-2xl font-bold">{VIEW_TITLES[station]}</h1>
        <Button variant="ghost" size="icon" onClick={load} aria-label="Actualizar">
          <RotateCw className="w-5 h-5" />
        </Button>
      </div>

      {isCombined && (
        <div className="flex gap-2 flex-wrap mb-4" role="group" aria-label="Mostrar">
          {Object.entries(FILTER_LABELS).map(([key, label]) => (
            <Button
              key={key}
              type="button"
              className="h-11 px-5"
              variant={filter === key ? 'default' : 'outline'}
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
            >
              {label}
            </Button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" />
        </div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-2xl">
          Nada pendiente en {emptyLabel?.toLowerCase()} por ahora.
        </div>
      ) : (
        <div className="space-y-4">
          {tickets.map(({ orderId, order, lines }) => (
            <StationTicket
              key={orderId}
              orderId={orderId}
              order={order}
              tablesById={tablesById}
              lines={lines}
              now={now}
              bar={bar}
              showStation={isCombined}
              canOperate={canOperate}
              ackedCancelled={ackedCancelled}
              onAcknowledgeCancelled={acknowledgeCancelled}
              onMarkReady={handleMarkReady}
              onMarkAllReady={handleMarkAllReady}
              onMarkDelivered={handleMarkDelivered}
              onUndo={handleUndo}
              busyIds={busyIds}
            />
          ))}
        </div>
      )}
    </div>
  );
}

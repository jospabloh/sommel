// Live order + its lines for the Orden screen (contract §5: "Live updates
// via base44.entities.OrderItem.subscribe / Order.subscribe filtered to the
// tenant+order (read-only; never write entities directly)"). `subscribe()`
// has no server-side filter (it streams every change for the entity type —
// see node_modules/@base44/sdk's entities.types.d.ts), so filtering to this
// one order happens here, client-side, on every event.
import { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { flattenRow, flattenEvent } from './helpers';

export function useOrderRealtime(orderId) {
  const [order, setOrder] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const active = !!orderId && orderId !== 'nueva';

  const reload = useCallback(async () => {
    // Defensive (fixed 2026-09-28): orderId undefined/'nueva' must never
    // leave `loading` stuck true — the initial state IS true, and the only
    // route that reaches this hook while inactive (Orden.jsx's `isNew`
    // branch) renders its own screen before ever looking at `loading`, but
    // nothing should depend on that ordering to avoid an infinite spinner.
    if (!active) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setNotFound(false);
    try {
      const [orderRow, itemRows] = await Promise.all([
        base44.entities.Order.get(orderId),
        base44.entities.OrderItem.filter({ order_id: orderId }),
      ]);
      setOrder(flattenRow(orderRow));
      setItems((itemRows || []).map(flattenRow).filter(Boolean));
    } catch {
      setOrder(null);
      setItems([]);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [orderId, active]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!active) return undefined;

    const unsubOrder = base44.entities.Order.subscribe((evt) => {
      const row = flattenEvent(evt);
      if (!row?.id || row.id !== orderId) return;
      if (evt.type === 'delete') {
        setOrder(null);
        setNotFound(true);
        return;
      }
      setOrder(row);
    });

    const unsubItems = base44.entities.OrderItem.subscribe((evt) => {
      const row = flattenEvent(evt);
      if (!row?.id) return;
      // A create/update event for a line not in THIS order is irrelevant;
      // a delete event carries no order_id once gone, so it's matched below
      // purely by id already being present in local state.
      setItems((prev) => {
        const idx = prev.findIndex((i) => i.id === row.id);
        if (evt.type === 'delete') {
          return idx === -1 ? prev : prev.filter((i) => i.id !== row.id);
        }
        if (row.order_id && row.order_id !== orderId) {
          // Line moved to another order (mergeOrders) — drop it locally.
          return idx === -1 ? prev : prev.filter((i) => i.id !== row.id);
        }
        if (idx === -1) {
          // Could be a line freshly created here, or one just merged IN from
          // another order — either way it belongs now.
          if (row.order_id && row.order_id !== orderId) return prev;
          return [...prev, row];
        }
        const next = prev.slice();
        next[idx] = { ...next[idx], ...row };
        return next;
      });
    });

    return () => {
      unsubOrder();
      unsubItems();
    };
  }, [orderId, active]);

  return { order, items, loading, notFound, reload, setItems };
}

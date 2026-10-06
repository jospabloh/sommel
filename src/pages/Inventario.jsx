// Inventario (Entrega 2, contrato §6 pantalla 10). Todo pasa por
// callFn('inventory', ...): la existencia nunca se escribe desde aquí, el
// servidor la recalcula de los movimientos. Productos ligados vía
// callFn('catalog','listProducts'); nunca se lee Product directo.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Package, Plus, RotateCw, AlertTriangle } from 'lucide-react';
import { callFn } from '@/lib/api';
import { usePermission } from '@/lib/usePermission';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import InventoryItemRow from '@/components/inventory/InventoryItemRow';
import MovementDialog from '@/components/inventory/MovementDialog';
import MovementsDialog from '@/components/inventory/MovementsDialog';
import ItemFormDialog from '@/components/inventory/ItemFormDialog';
import LinkProductsDialog from '@/components/inventory/LinkProductsDialog';
import { sortItems } from '@/components/inventory/helpers';

export default function Inventario() {
  const { can } = usePermission();
  const canView = can('Inventario:ver');
  const canEdit = can('Inventario:editar');
  const canWaste = can('Inventario:merma');
  const showCost = can('Menú:ver_costos');

  const [items, setItems] = useState([]);
  const [lowIds, setLowIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [movement, setMovement] = useState({ mode: null, item: null });
  const [historyItem, setHistoryItem] = useState(null);
  const [linkItem, setLinkItem] = useState(null);
  const [formItem, setFormItem] = useState(undefined); // undefined closed, null new, row edit
  // Product links per item, filled when the link dialog changes something.
  const [linkCounts, setLinkCounts] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await callFn('inventory', 'list');
      setItems(res.items || []);
      setLowIds(res.low || []);
    } catch (err) {
      setError(err.message || 'No se pudo cargar el inventario');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canView) load();
  }, [canView, load]);

  // Product counts per item come from the product list; best effort only.
  const loadCounts = useCallback(() => {
    callFn('catalog', 'listProducts', {})
      .then((res) => {
        const counts = {};
        (res.products || []).forEach((p) => {
          if (p.track_inventory && p.inventory_item_id) counts[p.inventory_item_id] = (counts[p.inventory_item_id] || 0) + 1;
        });
        setLinkCounts(counts);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (canView) loadCounts();
  }, [canView, loadCounts]);

  // Re-derive `low` locally after a movement or edit, using the server's rule.
  const applyItem = useCallback((fresh) => {
    if (!fresh) return;
    setItems((prev) => {
      const exists = prev.some((i) => i.id === fresh.id);
      return exists ? prev.map((i) => (i.id === fresh.id ? { ...i, ...fresh } : i)) : [...prev, fresh];
    });
    setLowIds((prev) => {
      const isLow = (Number(fresh.stock) || 0) <= (Number(fresh.low_threshold) || 0);
      const without = prev.filter((id) => id !== fresh.id);
      return isLow ? [...without, fresh.id] : without;
    });
  }, []);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = items.filter((i) => !term || String(i.name || '').toLowerCase().includes(term));
    return sortItems(filtered, lowIds);
  }, [items, lowIds, search]);

  const lowSet = useMemo(() => new Set(lowIds), [lowIds]);
  const lowCount = items.filter((i) => lowSet.has(i.id)).length;

  if (!canView) {
    return <div className="p-6 lg:p-10 text-muted-foreground">No tienes permiso para ver el inventario.</div>;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-10 max-w-3xl">
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="w-11 h-11 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
          <Package className="w-6 h-6 text-primary" />
        </div>
        <div className="flex-1 min-w-[9rem]">
          <h1 className="font-display text-2xl sm:text-3xl font-semibold">Inventario</h1>
          <p className="text-muted-foreground mt-0.5">Existencias, entradas, mermas y conteos.</p>
        </div>
        <Button variant="ghost" size="icon" onClick={load} aria-label="Actualizar" disabled={loading}>
          <RotateCw className={loading ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} />
        </Button>
        {canEdit && (
          <Button onClick={() => setFormItem(null)} className="h-10">
            <Plus className="w-4 h-4 mr-1.5" /> Nuevo insumo
          </Button>
        )}
      </div>

      {lowCount > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-destructive/50 bg-destructive/10 px-3 py-2.5 text-sm">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
          <span>
            {lowCount === 1 ? '1 insumo está en su mínimo o por debajo.' : `${lowCount} insumos están en su mínimo o por debajo.`}
          </span>
        </div>
      )}

      {items.length > 6 && (
        <Input placeholder="Buscar insumo" value={search} onChange={(e) => setSearch(e.target.value)} className="h-10 mb-4" />
      )}

      {error ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center space-y-3">
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" onClick={load}>Reintentar</Button>
        </div>
      ) : loading && items.length === 0 ? (
        <div className="flex justify-center py-10">
          <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center space-y-3">
          <p className="text-muted-foreground">Todavía no hay insumos.</p>
          {canEdit && <Button onClick={() => setFormItem(null)}>Crear el primer insumo</Button>}
        </div>
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ningún insumo coincide con la búsqueda.</p>
      ) : (
        <ul className="space-y-3">
          {visible.map((item) => (
            <InventoryItemRow
              key={item.id}
              item={item}
              isLow={lowSet.has(item.id)}
              showCost={showCost}
              linkedCount={linkCounts[item.id] || 0}
              canEdit={canEdit}
              canWaste={canWaste}
              onEntry={(i) => setMovement({ mode: 'entrada', item: i })}
              onWaste={(i) => setMovement({ mode: 'merma', item: i })}
              onCount={(i) => setMovement({ mode: 'conteo', item: i })}
              onHistory={setHistoryItem}
              onLink={setLinkItem}
              onEdit={(i) => setFormItem(i)}
            />
          ))}
        </ul>
      )}

      <MovementDialog
        mode={movement.mode}
        item={movement.item}
        showCost={showCost}
        onOpenChange={(v) => { if (!v) setMovement({ mode: null, item: null }); }}
        onDone={applyItem}
      />
      <MovementsDialog item={historyItem} onOpenChange={(v) => { if (!v) setHistoryItem(null); }} />
      <ItemFormDialog
        item={formItem}
        showCost={showCost}
        onOpenChange={(v) => { if (!v) setFormItem(undefined); }}
        onSaved={applyItem}
      />
      <LinkProductsDialog
        item={linkItem}
        items={items}
        onOpenChange={(v) => { if (!v) setLinkItem(null); }}
        onLinksChanged={loadCounts}
      />
    </div>
  );
}

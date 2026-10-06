// Menú del bar (contrato §5, pantallas 6 y 13 de la propuesta): categorías,
// productos con precio, variantes, modificadores sin costo, estación,
// activo/temporada. Costo y utilidad solo con `Menú:ver_costos`; edición
// solo con `Menú:editar`. Toda escritura pasa por `catalog` (contrato §4) —
// esta página nunca escribe entidades directo.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { callFn, ApiError } from '@/lib/api';
import { usePermission } from '@/lib/usePermission';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { GlassWater, Plus, Settings2, Loader2 } from 'lucide-react';
import ProductFormDialog from '@/components/menu/ProductFormDialog';
import CategoryManagerDialog from '@/components/menu/CategoryManagerDialog';
import ProductCard from '@/components/menu/ProductCard';

const EMPTY = { categories: [], products: [] };

export default function Menu() {
  const { can, loading: loadingPerms } = usePermission();
  const { toast } = useToast();
  const canEdit = can('Menú:editar');
  const canViewCosts = can('Menú:ver_costos');

  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState(null);
  const [productDialog, setProductDialog] = useState(null); // null | { product?, categoryId }
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [togglingId, setTogglingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Quien edita necesita ver también lo inactivo, para poder reactivarlo;
      // quien solo consulta el menú ve el menú real que vería un cliente.
      const res = await callFn('catalog', 'listProducts', { include_inactive: canEdit });
      const categories = res.categories ?? [];
      const products = res.products ?? [];
      setData({ categories, products });
      setActiveCategory((prev) =>
        prev && categories.some((c) => c.id === prev) ? prev : categories[0]?.id ?? null
      );
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'No se pudo cargar el menú',
        description: err instanceof ApiError ? err.message : 'Error de red, intenta de nuevo.',
      });
      setData(EMPTY);
    } finally {
      setLoading(false);
    }
  }, [canEdit, toast]);

  useEffect(() => {
    if (!loadingPerms) load();
  }, [loadingPerms, load]);

  const sortedCategories = useMemo(
    () => [...data.categories].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)),
    [data.categories]
  );

  const productsByCategory = useMemo(() => {
    const map = new Map();
    for (const p of data.products) {
      if (!map.has(p.category_id)) map.set(p.category_id, []);
      map.get(p.category_id).push(p);
    }
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name, 'es'));
    return map;
  }, [data.products]);

  const handleToggleActive = async (product, active) => {
    setTogglingId(product.id);
    // Optimista: la mayoría de los toggles no fallan y esperar la ida y
    // vuelta completa se siente lento en una tablet en piso.
    setData((d) => ({
      ...d,
      products: d.products.map((p) => (p.id === product.id ? { ...p, active } : p)),
    }));
    try {
      await callFn('catalog', 'toggleProduct', { id: product.id, active });
    } catch (err) {
      setData((d) => ({
        ...d,
        products: d.products.map((p) => (p.id === product.id ? { ...p, active: !active } : p)),
      }));
      toast({
        variant: 'destructive',
        title: 'No se pudo cambiar el estado',
        description: err instanceof ApiError ? err.message : 'Error de red, intenta de nuevo.',
      });
    } finally {
      setTogglingId(null);
    }
  };

  if (loadingPerms || (loading && data.categories.length === 0)) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!can('Menú:ver')) {
    return <div className="p-10 text-muted-foreground">No tienes acceso al menú.</div>;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-10 max-w-4xl">
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
            <GlassWater className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-3xl font-semibold">Menú</h1>
            <p className="text-muted-foreground mt-0.5">Categorías y productos del bar</p>
          </div>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setCategoryManagerOpen(true)}>
              <Settings2 className="w-4 h-4" /> Categorías
            </Button>
            <Button
              onClick={() => setProductDialog({ categoryId: activeCategory })}
              disabled={!activeCategory}
            >
              <Plus className="w-4 h-4" /> Producto
            </Button>
          </div>
        )}
      </div>

      {sortedCategories.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          Todavía no hay categorías.
          {canEdit && (
            <div className="mt-4">
              <Button onClick={() => setCategoryManagerOpen(true)}>
                <Plus className="w-4 h-4" /> Crear la primera categoría
              </Button>
            </div>
          )}
        </div>
      ) : (
        <Tabs value={activeCategory ?? undefined} onValueChange={setActiveCategory}>
          <TabsList className="flex-wrap h-auto justify-start">
            {sortedCategories.map((cat) => (
              <TabsTrigger key={cat.id} value={cat.id}>
                {cat.name}
                <span className="ml-1.5 text-xs text-muted-foreground">
                  {(productsByCategory.get(cat.id) || []).length}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
          {sortedCategories.map((cat) => {
            const products = productsByCategory.get(cat.id) || [];
            return (
              <TabsContent key={cat.id} value={cat.id} className="space-y-3 pt-4">
                {products.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground text-sm">
                    Sin productos en esta categoría todavía.
                  </div>
                ) : (
                  products.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      canEdit={canEdit}
                      canViewCosts={canViewCosts}
                      onEdit={() => setProductDialog({ product, categoryId: cat.id })}
                      onToggleActive={(active) => handleToggleActive(product, active)}
                      toggleDisabled={togglingId === product.id}
                    />
                  ))
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      )}

      {productDialog && (
        <ProductFormDialog
          open
          onOpenChange={(v) => !v && setProductDialog(null)}
          product={productDialog.product}
          categories={data.categories}
          defaultCategoryId={productDialog.categoryId}
          canViewCosts={canViewCosts}
          onSaved={load}
        />
      )}

      <CategoryManagerDialog
        open={categoryManagerOpen}
        onOpenChange={setCategoryManagerOpen}
        categories={data.categories}
        products={data.products}
        onChanged={load}
      />
    </div>
  );
}

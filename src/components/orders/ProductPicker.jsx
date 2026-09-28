// Categorías -> productos (contrato §5, pantalla 7). Nunca lee `Product`
// directo (contrato §1) — todo pasa por `catalog.listProducts`, que ya
// redacta `cost` del lado del servidor si falta `Menú:ver_costos` (D7).
import React, { useEffect, useMemo, useState } from 'react';
import { Wine } from 'lucide-react';
import { cn } from '@/lib/utils';
import { callFn } from '@/lib/api';
import { formatMXN } from '@/lib/money';
import { toast } from '@/components/ui/use-toast';

export default function ProductPicker({ onPick }) {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [activeCategory, setActiveCategory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { categories: cats, products: prods } = await callFn('catalog', 'listProducts', {});
        if (cancelled) return;
        const sortedCats = [...(cats || [])].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
        setCategories(sortedCats);
        setProducts(prods || []);
        setActiveCategory(sortedCats[0]?.id ?? null);
      } catch (err) {
        toast({ title: 'No se pudo cargar el menú', description: err.message, variant: 'destructive' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (q) return p.name.toLowerCase().includes(q);
      return p.category_id === activeCategory;
    });
  }, [products, activeCategory, search]);

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <div className="w-6 h-6 border-4 border-border border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar producto…"
        className="w-full mb-3 h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
      {!search && (
        <div className="flex gap-2 overflow-x-auto pb-2 mb-2 -mx-1 px-1 [scrollbar-width:none]">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setActiveCategory(c.id)}
              className={cn(
                'shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors',
                activeCategory === c.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              )}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-10 text-sm text-muted-foreground">
          {search ? 'Sin resultados.' : 'No hay productos en esta categoría.'}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onPick(p)}
              className="rounded-xl border border-border bg-card p-3 text-left hover:border-primary/50 active:scale-[0.98] transition-transform"
            >
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center mb-2 text-primary">
                <Wine className="w-4 h-4" />
              </div>
              <div className="font-medium text-sm leading-tight line-clamp-2">{p.name}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {p.variants?.length ? `Desde ${formatMXN(Math.min(...p.variants.map((v) => v.price)))}` : formatMXN(p.price)}
              </div>
              {p.seasonal && <div className="text-[10px] text-primary mt-1">Temporada</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

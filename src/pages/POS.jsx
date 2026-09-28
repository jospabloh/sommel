import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { formatCurrency } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { ShoppingCart, Minus, Plus, Trash2, Loader2, Wine, CheckCircle2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function POS() {
  const { user } = useAuth();
  const tenantId = user?.data?.tenant_id;
  const [products, setProducts] = useState([]);
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('bar'); // 'bar' | 'table'
  const [selectedTable, setSelectedTable] = useState(null);
  const [cart, setCart] = useState([]);
  const [category, setCategory] = useState('Todos');
  const [processing, setProcessing] = useState(false);
  const [lastSale, setLastSale] = useState(null);

  const load = async () => {
    const [prods, tbls] = await Promise.all([
      base44.entities.Product.filter({ tenant_id: tenantId }, 'category_id', 200),
      base44.entities.BarTable.filter({ tenant_id: tenantId }, 'name', 100)
    ]);
    setProducts(prods); setTables(tbls); setLoading(false);
  };
  useEffect(() => { if (tenantId) load(); }, [tenantId]);

  const categories = useMemo(() => {
    const set = new Set(products.map(p => p.data.category_id).filter(Boolean));
    return ['Todos', ...Array.from(set)];
  }, [products]);

  const filtered = useMemo(() => {
    if (category === 'Todos') return products;
    return products.filter(p => p.data.category_id === category);
  }, [products, category]);

  const addToCart = (product) => {
    if (mode === 'table' && !selectedTable) return;
    setCart(prev => {
      const existing = prev.find(i => i.product_id === product.id);
      if (existing) {
        return prev.map(i => i.product_id === product.id ? { ...i, quantity: i.quantity + 1, subtotal: (i.unit_price) * (i.quantity + 1) } : i);
      }
      return [...prev, { product_id: product.id, name: product.data.name, unit_price: product.data.price, quantity: 1, subtotal: product.data.price }];
    });
    // mark table occupied on first item
    if (mode === 'table' && selectedTable && selectedTable.data.status === 'available') {
      base44.entities.BarTable.update(selectedTable.id, { status: 'occupied' });
      setSelectedTable({ ...selectedTable, data: { ...selectedTable.data, status: 'occupied' } });
      setTables(prev => prev.map(t => t.id === selectedTable.id ? { ...t, data: { ...t.data, status: 'occupied' } } : t));
    }
  };

  const changeQty = (productId, delta) => {
    setCart(prev => prev.map(i => {
      if (i.product_id !== productId) return i;
      const q = i.quantity + delta;
      if (q <= 0) return null;
      return { ...i, quantity: q, subtotal: i.unit_price * q };
    }).filter(Boolean));
  };
  const removeItem = (productId) => setCart(prev => prev.filter(i => i.product_id !== productId));
  const clearCart = () => setCart([]);

  const total = cart.reduce((s, i) => s + i.subtotal, 0);

  const selectTable = (table) => {
    setSelectedTable(table);
    setCart([]);
    setLastSale(null);
  };

  const charge = async () => {
    if (cart.length === 0) return;
    setProcessing(true);
    try {
      const res = await base44.functions.invoke('processSale', {
        items: cart,
        table_id: mode === 'table' ? selectedTable?.id : null,
        table_name: mode === 'table' ? selectedTable?.data?.name : null,
        type: mode
      });
      setLastSale({ total, items: cart.length });
      setCart([]);
      if (mode === 'table') {
        setSelectedTable(null);
        await load();
      } else {
        // refresh stock
        const prods = await base44.entities.Product.filter({ tenant_id: tenantId }, 'category_id', 200);
        setProducts(prods);
      }
    } catch (err) {
      alert(err.response?.data?.error || err.message || 'Error al cobrar');
    } finally {
      setProcessing(false);
    }
  };

  if (!tenantId) return <div className="p-10 text-muted-foreground">Sin bar asignado.</div>;

  return (
    <div className="flex flex-col h-screen">
      {/* Mode switch */}
      <div className="border-b border-border bg-card px-6 py-3 flex items-center gap-3">
        <div className="flex bg-muted rounded-lg p-1">
          <button onClick={() => { setMode('bar'); setSelectedTable(null); setCart([]); setLastSale(null); }} className={cn('px-4 py-2 rounded-md text-sm font-medium transition-colors', mode === 'bar' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>Barra</button>
          <button onClick={() => { setMode('table'); setCart([]); setLastSale(null); }} className={cn('px-4 py-2 rounded-md text-sm font-medium transition-colors', mode === 'table' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>Mesas</button>
        </div>
        {mode === 'table' && selectedTable && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Mesa:</span>
            <span className="font-medium">{selectedTable.data.name}</span>
            <button onClick={() => { setSelectedTable(null); setCart([]); }} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
          </div>
        )}
        {lastSale && (
          <div className="ml-auto flex items-center gap-2 text-sm text-primary">
            <CheckCircle2 className="w-4 h-4" /> Cobrado {formatCurrency(lastSale.total)}
          </div>
        )}
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Left: products or table picker */}
        <div className="flex-1 flex flex-col min-w-0">
          {mode === 'table' && !selectedTable ? (
            <div className="p-6 overflow-auto">
              <h2 className="font-display text-xl font-semibold mb-4">Selecciona una mesa</h2>
              {loading ? <div className="flex justify-center py-10"><div className="w-7 h-7 border-4 border-border border-t-primary rounded-full animate-spin" /></div> : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {tables.map(t => (
                    <button key={t.id} onClick={() => selectTable(t)} className={cn('aspect-square rounded-2xl border-2 flex flex-col items-center justify-center gap-2 transition-colors', t.data.status === 'occupied' ? 'border-accent bg-accent/10' : 'border-border bg-card hover:border-primary')}>
                      <Wine className={cn('w-8 h-8', t.data.status === 'occupied' ? 'text-accent' : 'text-muted-foreground')} />
                      <span className="font-medium">{t.data.name}</span>
                      <span className="text-xs text-muted-foreground">{t.data.seats} lugares</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="px-6 pt-4 pb-2 flex gap-2 overflow-x-auto">
                {categories.map(c => (
                  <button key={c} onClick={() => setCategory(c)} className={cn('px-4 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors', category === c ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground')}>{c}</button>
                ))}
              </div>
              <div className="flex-1 overflow-auto px-6 pb-6">
                {loading ? <div className="flex justify-center py-10"><div className="w-7 h-7 border-4 border-border border-t-primary rounded-full animate-spin" /></div> : (
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                    {filtered.map(p => (
                      <button key={p.id} onClick={() => addToCart(p)} className="rounded-2xl border border-border bg-card p-4 text-left transition-all hover:border-primary active:scale-95">
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <Wine className="w-5 h-5 text-primary" />
                          </div>
                        </div>
                        <div className="font-medium text-sm leading-tight mb-1 line-clamp-2">{p.data.name}</div>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-primary font-semibold">{formatCurrency(p.data.price)}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Right: cart */}
        <aside className="w-80 lg:w-96 shrink-0 border-l border-border bg-card flex flex-col">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold flex items-center gap-2"><ShoppingCart className="w-5 h-5" /> Cuenta</h3>
            {cart.length > 0 && <button onClick={clearCart} className="text-xs text-muted-foreground hover:text-destructive">Vaciar</button>}
          </div>
          <div className="flex-1 overflow-auto px-3 py-3 space-y-2">
            {cart.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground mt-10">Toca productos para agregarlos</p>
            ) : cart.map(i => (
              <div key={i.product_id} className="flex items-center gap-2 bg-muted/50 rounded-xl p-2.5">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{i.name}</div>
                  <div className="text-xs text-muted-foreground">{formatCurrency(i.unit_price)} c/u</div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => changeQty(i.product_id, -1)} className="w-7 h-7 rounded-lg bg-card border border-border flex items-center justify-center hover:bg-border"><Minus className="w-3.5 h-3.5" /></button>
                  <span className="w-6 text-center text-sm font-medium">{i.quantity}</span>
                  <button onClick={() => changeQty(i.product_id, 1)} className="w-7 h-7 rounded-lg bg-card border border-border flex items-center justify-center hover:bg-border"><Plus className="w-3.5 h-3.5" /></button>
                </div>
                <div className="w-16 text-right text-sm font-semibold">{formatCurrency(i.subtotal)}</div>
                <button onClick={() => removeItem(i.product_id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
          <div className="border-t border-border p-5 space-y-3">
            <div className="flex items-center justify-between text-lg font-semibold">
              <span>Total</span>
              <span className="text-primary">{formatCurrency(total)}</span>
            </div>
            <Button onClick={charge} disabled={cart.length === 0 || processing} className="w-full h-14 text-base text-lg">
              {processing ? <Loader2 className="w-5 h-5 animate-spin" /> : `Cobrar ${formatCurrency(total)}`}
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
import React, { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { Loader2 } from 'lucide-react';
import { Image } from '@/components/ui/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const SOMMEL_LOGO = 'https://media.base44.com/images/public/6ab41c2a89f592a0eca074d2/068ca3173_Sommel_logo.png';

export default function Onboarding() {
  const { user, checkUserAuth } = useAuth();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setError('El nombre del bar es obligatorio'); return; }
    setLoading(true); setError('');
    try {
      const bar = await base44.entities.WineBar.create({
        name: name.trim(),
        address: address.trim(),
        subscription_status: 'trial',
        owner_id: user.id
      });
      await base44.auth.updateMe({ tenant_id: bar.id, app_role: 'bar_admin' });

      // Seed a small default catalog + tables so POS is usable immediately
      await base44.entities.Product.bulkCreate([
        { tenant_id: bar.id, name: 'Copa de Malbec', type: 'glass', category: 'Tinto', price: 90, stock: 40, low_stock_threshold: 8 },
        { tenant_id: bar.id, name: 'Copa de Cabernet', type: 'glass', category: 'Tinto', price: 95, stock: 30, low_stock_threshold: 8 },
        { tenant_id: bar.id, name: 'Copa de Chardonnay', type: 'glass', category: 'Blanco', price: 85, stock: 35, low_stock_threshold: 8 },
        { tenant_id: bar.id, name: 'Copa de Sauvignon Blanc', type: 'glass', category: 'Blanco', price: 80, stock: 32, low_stock_threshold: 8 },
        { tenant_id: bar.id, name: 'Copa de Cava Brut', type: 'glass', category: 'Espumoso', price: 100, stock: 25, low_stock_threshold: 6 },
        { tenant_id: bar.id, name: 'Botella Malbec Reserva', type: 'bottle', category: 'Tinto', price: 480, stock: 12, low_stock_threshold: 3 },
        { tenant_id: bar.id, name: 'Botella Prosecco', type: 'bottle', category: 'Espumoso', price: 420, stock: 10, low_stock_threshold: 3 },
        { tenant_id: bar.id, name: 'Aperitivo Aperol', type: 'glass', category: 'Aperitivo', price: 110, stock: 20, low_stock_threshold: 5 }
      ]);
      await base44.entities.BarTable.bulkCreate([
        { tenant_id: bar.id, name: 'Barra 1', status: 'available', seats: 4 },
        { tenant_id: bar.id, name: 'Barra 2', status: 'available', seats: 4 },
        { tenant_id: bar.id, name: 'Mesa 1', status: 'available', seats: 4 },
        { tenant_id: bar.id, name: 'Mesa 2', status: 'available', seats: 6 }
      ]);

      await checkUserAuth();
    } catch (err) {
      setError(err.message || 'No se pudo crear el bar');
      setLoading(false);
    }
  };

  return (
    <div className="dark min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-12 h-12 rounded-xl overflow-hidden ring-1 ring-border">
            <Image src={SOMMEL_LOGO} alt="Sommel" className="w-full h-full" fittingType="fill" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold">Configura tu Wine Bar</h1>
            <p className="text-sm text-muted-foreground">Un par de datos y empezamos a vender</p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4 bg-card border border-border rounded-2xl p-6">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre del bar</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. La Cava de Aurelio" autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="address">Dirección (opcional)</Label>
            <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Calle, número, ciudad" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full h-12 text-base">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Crear mi bar'}
          </Button>
        </form>
      </div>
    </div>
  );
}
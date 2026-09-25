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
      // Server-side: the bar, the owner's tenant_id/app_role (locked on User)
      // and the starter catalog + tables.
      const res = await base44.functions.invoke('createWineBar', { name: name.trim(), address: address.trim() });
      if (res?.data?.error) throw new Error(res.data.error);

      await checkUserAuth();
    } catch (err) {
      // A non-2xx rejects; the function's own message is in response.data.
      setError(err.response?.data?.error || err.message || 'No se pudo crear el bar');
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
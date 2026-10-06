import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Loader2 } from 'lucide-react';
import { clearPendingName, readPendingName } from '@/lib/pendingName';
import { Image } from '@/components/ui/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';

const SOMMEL_LOGO = 'https://media.base44.com/images/public/6ab41c2a89f592a0eca074d2/068ca3173_Sommel_logo.png';

export default function Onboarding() {
  const { user, checkUserAuth } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [ownName, setOwnName] = useState(() => readPendingName(user?.email) || String(user?.full_name || '').trim());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Módulo 19/22 (fix 2026-09-28): a person who registered from a Base44
  // invite email (StaffInvite pending, no account yet at invite time) lands
  // here with no bar of their own. Before showing "create your bar", check
  // whether a pending invite is waiting for this exact email and claim it —
  // that's what actually assigns tenant_id/app_role for that case.
  const [claiming, setClaiming] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function claim() {
      try {
        const pending = readPendingName(user?.email);
        const res = await base44.functions.invoke('manageStaff', { action: 'claimInvite', ...(pending ? { display_name: pending } : {}) });
        if (cancelled) return;
        if (res?.data?.claimed) {
          clearPendingName(user?.email);
          toast({
            title: res.data.bar_name ? `Te uniste a ${res.data.bar_name}` : 'Te uniste al bar',
          });
          await checkUserAuth();
          navigate('/mesas', { replace: true });
          return;
        }
      } catch {
        // Best-effort: if the claim check fails, just fall through to the
        // "create your bar" form — nothing here is destructive.
      }
      if (!cancelled) setClaiming(false);
    }
    claim();
    return () => { cancelled = true; };
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!ownName.trim()) { setError('Escribe tu nombre'); return; }
    if (!name.trim()) { setError('El nombre del bar es obligatorio'); return; }
    setLoading(true); setError('');
    try {
      // Server-side: the bar, the owner's tenant_id/app_role (locked on User)
      // and the starter catalog + tables.
      const res = await base44.functions.invoke('createWineBar', { name: name.trim(), address: address.trim(), display_name: ownName.trim() });
      if (res?.data?.error) throw new Error(res.data.error);
      clearPendingName(user?.email);

      await checkUserAuth();
    } catch (err) {
      // A non-2xx rejects; the function's own message is in response.data.
      setError(err.response?.data?.error || err.message || 'No se pudo crear el bar');
      setLoading(false);
    }
  };

  if (claiming) {
    return (
      <div className="dark min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
          <p className="text-sm">Buscando invitaciones pendientes…</p>
        </div>
      </div>
    );
  }

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
            <Label htmlFor="own-name">Tu nombre</Label>
            <Input id="own-name" value={ownName} onChange={(e) => setOwnName(e.target.value)} placeholder="Nombre y apellido" maxLength={60} autoComplete="name" />
          </div>
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
        <p className="text-xs text-muted-foreground text-center mt-4">
          ¿Te invitaron? Pide a tu administrador que te invite con este mismo correo.
        </p>
      </div>
    </div>
  );
}
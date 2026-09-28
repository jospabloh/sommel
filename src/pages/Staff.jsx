import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Users, UserPlus, Mail, Clock, X } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

export default function Staff() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;
  const { toast } = useToast();
  const [staff, setStaff] = useState(null);
  const [invites, setInvites] = useState([]);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [revokingId, setRevokingId] = useState(null);

  const load = async () => {
    try {
      const res = await base44.functions.invoke('manageStaff', { action: 'list' });
      setStaff(res.data?.staff || []);
      setInvites(res.data?.invites || []);
    } catch (err) {
      setStaff([]);
      setInvites([]);
    }
  };
  useEffect(() => { if (tenantId) load(); }, [tenantId]);

  const invite = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    try {
      const res = await base44.functions.invoke('manageStaff', { action: 'invite', email: email.trim() });
      setEmail('');
      // Módulo 19/22: si la persona no tenía cuenta, no hay staff nuevo que
      // mostrar todavía — solo una invitación pendiente que se unirá cuando
      // cree su cuenta con ese mismo correo.
      if (res?.data?.email_sent === false) {
        toast({
          title: 'Acceso guardado, pero el correo no salió',
          description: 'Pídele que entre a sommel.acaciaco.com.mx y cree su cuenta con ese mismo correo.',
        });
      } else if (res?.data?.invited_existing === false) {
        toast({ title: 'Invitación enviada. Se unirá al bar cuando cree su cuenta con ese correo.' });
      } else {
        toast({ title: 'Listo. Le mandamos un correo para que entre.' });
      }
      await load();
    } catch (err) {
      alert(err.response?.data?.error || err.message || 'Error al invitar');
    }
    setBusy(false);
  };

  const revoke = async (inviteId) => {
    setRevokingId(inviteId);
    try {
      await base44.functions.invoke('manageStaff', { action: 'revokeInvite', invite_id: inviteId });
      await load();
    } catch (err) {
      alert(err.response?.data?.error || err.message || 'Error al revocar');
    }
    setRevokingId(null);
  };

  if (!tenantId) return <div className="p-10 text-muted-foreground">Sin bar asignado.</div>;

  return (
    <div className="p-6 lg:p-10 max-w-3xl">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-11 h-11 rounded-xl bg-primary/15 flex items-center justify-center"><Users className="w-6 h-6 text-primary" /></div>
        <div>
          <h1 className="font-display text-3xl font-semibold">Staff</h1>
          <p className="text-muted-foreground mt-0.5">Invita meseros a tu bar</p>
        </div>
      </div>

      <form onSubmit={invite} className="flex gap-3 mb-8">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@mesero.com" className="flex-1 h-11" required />
        <Button type="submit" disabled={busy} className="h-11"><UserPlus className="w-4 h-4 mr-1" /> Invitar</Button>
      </form>

      {!staff ? (
        <div className="flex justify-center py-10"><div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" /></div>
      ) : staff.length === 0 && invites.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Mail className="w-10 h-10 mx-auto mb-3 opacity-40" />
          Aún no hay staff invitado.
        </div>
      ) : (
        <div className="space-y-6">
          {staff.length > 0 && (
            <div className="space-y-2">
              {staff.map((s) => (
                <div key={s.id} className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
                    {(s.full_name || s.email || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{s.full_name || s.email}</div>
                    <div className="text-xs text-muted-foreground truncate">{s.email}</div>
                  </div>
                  <span className="text-xs bg-muted px-2.5 py-1 rounded-full capitalize">{s.app_role === 'bar_admin' ? 'Admin' : 'Mesero'}</span>
                </div>
              ))}
            </div>
          )}

          {invites.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-muted-foreground mb-2">Invitaciones pendientes</h2>
              <div className="space-y-2">
                {invites.map((inv) => (
                  <div key={inv.id} className="bg-card border border-dashed border-border rounded-xl p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                      <Clock className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{inv.email}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {inv.app_role === 'bar_admin' ? 'Admin' : 'Mesero'}
                        {inv.expires_at ? ` · vence ${new Date(inv.expires_at).toLocaleDateString('es-MX')}` : ''}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={revokingId === inv.id}
                      onClick={() => revoke(inv.id)}
                    >
                      <X className="w-4 h-4 mr-1" /> Revocar
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
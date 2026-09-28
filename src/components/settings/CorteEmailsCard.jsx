// Ajustes: correos que reciben el corte al cerrar turno. Sin destinatarios el
// corte se guarda igual y queda pendiente de reenviar.
import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { callFn } from '@/lib/api';
import { toast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function CorteEmailsCard({ bar, onSaved }) {
  const emails = bar.corte_emails || [];
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async (next) => {
    setBusy(true);
    try {
      const { bar: fresh } = await callFn('settings', 'update', { corte_emails: next });
      onSaved(fresh);
      return true;
    } catch (err) {
      toast({ title: 'No se pudo guardar', description: err.message, variant: 'destructive' });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async (e) => {
    e.preventDefault();
    const value = email.trim();
    if (!value) return;
    const ok = await save([...emails, value]);
    if (ok) setEmail('');
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4 sm:p-5 space-y-4">
      <div>
        <h2 className="font-display text-lg font-semibold">Correos del corte</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Al cerrar el turno se manda el corte a estos correos.
        </p>
      </div>

      {emails.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aún no hay correos. El corte se guarda igual, pero no se envía hasta que agregues uno.
        </p>
      ) : (
        <ul className="space-y-2">
          {emails.map((addr) => (
            <li key={addr} className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
              <span className="flex-1 min-w-0 truncate text-sm">{addr}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={busy}
                onClick={() => save(emails.filter((x) => x !== addr))}
                aria-label={`Quitar ${addr}`}
              >
                <X className="w-4 h-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="flex gap-2">
        <Input
          type="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="correo@ejemplo.com"
          className="h-11 flex-1"
          aria-label="Correo para el corte"
        />
        <Button type="submit" disabled={busy || !email.trim()} className="h-11">
          <Plus className="w-4 h-4 mr-1" /> Agregar
        </Button>
      </form>
    </div>
  );
}

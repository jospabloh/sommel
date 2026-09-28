// Ajustes: formas de pago (agregar "Vales", activar y desactivar).
// Una forma nunca se borra: se desactiva, porque los pagos viejos conservan
// su nombre. El servidor valida que quede una activa y una de efectivo.
import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { callFn } from '@/lib/api';
import { toast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';

export default function PaymentMethodsCard({ bar, onSaved }) {
  const methods = bar.payment_methods || [];
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async (next, okTitle) => {
    setBusy(true);
    try {
      const { bar: fresh } = await callFn('settings', 'update', { payment_methods: next });
      onSaved(fresh);
      if (okTitle) toast({ title: okTitle });
      return true;
    } catch (err) {
      toast({ title: 'No se pudo guardar', description: err.message, variant: 'destructive' });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const toggle = (key, active) =>
    save(methods.map((m) => (m.key === key ? { ...m, active } : m)));

  const add = async (e) => {
    e.preventDefault();
    const name = label.trim();
    if (!name) return;
    const ok = await save(
      [...methods, { label: name, is_cash: false, active: true }],
      `Forma de pago "${name}" agregada`
    );
    if (ok) setLabel('');
  };

  const activeCount = methods.filter((m) => m.active).length;

  return (
    <div className="bg-card border border-border rounded-xl p-4 sm:p-5 space-y-4">
      <div>
        <h2 className="font-display text-lg font-semibold">Formas de pago</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Las activas aparecen al cobrar. Agrega otras, como vales, si las aceptan.
        </p>
      </div>

      <ul className="divide-y divide-border">
        {methods.map((m) => {
          const lastActive = m.active && activeCount === 1;
          return (
            <li key={m.key} className="flex items-center gap-3 py-3 min-h-12">
              <div className="flex-1 min-w-0">
                <span className={m.active ? 'font-medium' : 'font-medium text-muted-foreground'}>{m.label}</span>
                {m.is_cash && (
                  <Badge variant="secondary" className="ml-2">Efectivo</Badge>
                )}
              </div>
              <Switch
                checked={m.active}
                disabled={busy || lastActive}
                onCheckedChange={(v) => toggle(m.key, v)}
                aria-label={`${m.active ? 'Desactivar' : 'Activar'} ${m.label}`}
              />
            </li>
          );
        })}
      </ul>

      <form onSubmit={add} className="flex gap-2">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Nueva forma de pago, p. ej. Vales"
          maxLength={30}
          className="h-11 flex-1"
          aria-label="Nombre de la nueva forma de pago"
        />
        <Button type="submit" disabled={busy || !label.trim()} className="h-11">
          <Plus className="w-4 h-4 mr-1" /> Agregar
        </Button>
      </form>
    </div>
  );
}

// Ajustes: nombre del bar. Solo lo ve y lo cambia un administrador; el
// servidor lo vuelve a comprobar (settings.update rechaza `name` a los demás).
import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { callFn } from '@/lib/api';
import { barSummaryKey } from '@/lib/useBarSummary';
import { useAuth } from '@/lib/AuthContext';
import { toast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function BarNameCard({ bar, onSaved }) {
  const [name, setName] = useState(bar.name || '');
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  useEffect(() => setName(bar.name || ''), [bar.name]);

  const trimmed = name.trim();
  const dirty = trimmed !== (bar.name || '');

  const save = async (e) => {
    e.preventDefault();
    if (!trimmed || !dirty) return;
    setSaving(true);
    try {
      const { bar: fresh } = await callFn('settings', 'update', { name: trimmed });
      onSaved(fresh);
      // The sidebar shows the name from the shared bar query; refresh it.
      queryClient.invalidateQueries({ queryKey: barSummaryKey(user?.tenant_id ?? null) });
      toast({ title: 'Nombre del bar guardado' });
    } catch (err) {
      toast({ title: 'No se pudo guardar', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="bg-card border border-border rounded-xl p-4 sm:p-5 space-y-4">
      <div>
        <h2 className="font-display text-lg font-semibold">Nombre del bar</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Sale en el ticket, el corte y los correos.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="set-name">Nombre</Label>
        <Input id="set-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className="h-11" required />
      </div>
      <Button type="submit" disabled={saving || !dirty || !trimmed} className="h-11">
        {saving ? 'Guardando…' : 'Guardar nombre'}
      </Button>
    </form>
  );
}

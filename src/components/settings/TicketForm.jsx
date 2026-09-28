// Ajustes: datos que salen impresos en el ticket (contrato Entrega 2 §5).
// Guarda con settings.update; el servidor valida (RFC, largos).
import React, { useEffect, useState } from 'react';
import { callFn } from '@/lib/api';
import { toast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

export default function TicketForm({ bar, onSaved }) {
  const [form, setForm] = useState({ address: '', rfc: '', ticket_header: '', ticket_footer: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      address: bar.address || '',
      rfc: bar.rfc || '',
      ticket_header: bar.ticket_header || '',
      ticket_footer: bar.ticket_footer || '',
    });
  }, [bar]);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const dirty =
    form.address !== (bar.address || '') ||
    form.rfc !== (bar.rfc || '') ||
    form.ticket_header !== (bar.ticket_header || '') ||
    form.ticket_footer !== (bar.ticket_footer || '');

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { bar: fresh } = await callFn('settings', 'update', form);
      onSaved(fresh);
      toast({ title: 'Datos del ticket guardados' });
    } catch (err) {
      toast({ title: 'No se pudo guardar', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="bg-card border border-border rounded-xl p-4 sm:p-5 space-y-4">
      <div>
        <h2 className="font-display text-lg font-semibold">Datos del ticket</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Salen impresos en el ticket de 58 mm. El ticket no desglosa IVA y dice que no es una factura.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="set-address">Dirección</Label>
        <Input id="set-address" value={form.address} onChange={set('address')} maxLength={200} className="h-11" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="set-rfc">RFC (opcional)</Label>
        <Input
          id="set-rfc"
          value={form.rfc}
          onChange={set('rfc')}
          maxLength={13}
          autoCapitalize="characters"
          className="h-11 uppercase"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="set-header">Encabezado</Label>
        <Textarea id="set-header" value={form.ticket_header} onChange={set('ticket_header')} maxLength={200} rows={2} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="set-footer">Pie del ticket</Label>
        <Textarea id="set-footer" value={form.ticket_footer} onChange={set('ticket_footer')} maxLength={200} rows={2} />
      </div>

      <Button type="submit" disabled={saving || !dirty} className="h-11 w-full sm:w-auto">
        {saving ? 'Guardando...' : 'Guardar'}
      </Button>
    </form>
  );
}

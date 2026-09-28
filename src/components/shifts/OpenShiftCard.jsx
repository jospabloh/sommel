// Sin turno abierto: pide el fondo de caja y abre.
import React, { useState } from 'react';
import { callFn } from '@/lib/api';
import { toast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import MoneyField from './MoneyField';
import { parsePesos } from './helpers';

export default function OpenShiftCard({ onOpened, onConflict }) {
  const [float, setFloat] = useState('');
  const [busy, setBusy] = useState(false);
  const cents = float.trim() === '' ? 0 : parsePesos(float);
  const invalid = cents === null;

  const submit = async (e) => {
    e.preventDefault();
    if (invalid || busy) return;
    setBusy(true);
    try {
      await callFn('shifts', 'open', { opening_float: cents });
      toast({ title: 'Turno abierto' });
      onOpened();
    } catch (err) {
      if (err.code === 'shift_open') {
        toast({ title: 'Ya hay un turno abierto', description: 'Se actualizó la pantalla.' });
        onConflict();
      } else {
        toast({ title: 'No se pudo abrir el turno', description: err.message, variant: 'destructive' });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-card border border-border rounded-xl p-4 sm:p-5 space-y-4">
      <div>
        <h2 className="font-display text-lg font-semibold">Abrir turno</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Cuenta el efectivo con el que arranca la caja. Sin turno abierto no se puede cobrar.
        </p>
      </div>
      <MoneyField
        id="opening-float"
        label="Fondo de caja"
        value={float}
        onChange={setFloat}
        hint={invalid ? 'Escribe un monto válido, por ejemplo 500 o 500.50' : 'Déjalo vacío si la caja arranca en cero'}
      />
      <Button type="submit" className="w-full h-12 text-base" disabled={invalid || busy}>
        {busy ? 'Abriendo…' : 'Abrir turno'}
      </Button>
    </form>
  );
}

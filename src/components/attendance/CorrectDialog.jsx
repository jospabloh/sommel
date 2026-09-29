// Corregir una marca: entrada y salida (hora del bar) con nota obligatoria.
import React, { useEffect, useState } from 'react';
import { callFn } from '@/lib/api';
import { toast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { fromLocalInput, toLocalInput } from './helpers';

export default function CorrectDialog({ record, onOpenChange, onDone }) {
  const [clockIn, setClockIn] = useState('');
  const [clockOut, setClockOut] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (record) {
      setClockIn(toLocalInput(record.clock_in));
      setClockOut(toLocalInput(record.clock_out));
      setNote('');
      setError(null);
    }
  }, [record]);

  if (!record) return null;

  const inISO = fromLocalInput(clockIn);
  const outISO = clockOut ? fromLocalInput(clockOut) : null;
  const wasOpen = !record.clock_out;
  // Compare at the input's granularity (minutes): a real mark carries seconds
  // the input cannot show, so an untouched field must not count as a change.
  const inChanged = clockIn !== toLocalInput(record.clock_in);
  const outChanged = !!clockOut && (wasOpen || clockOut !== toLocalInput(record.clock_out));
  const canSubmit = !!inISO && (!clockOut || !!outISO) && note.trim().length > 0 && (inChanged || outChanged) && !busy;

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    // Solo se manda lo que cambió; una marca abierta se puede dejar abierta.
    const payload = { record_id: record.id, note: note.trim() };
    if (inChanged) payload.clock_in = inISO;
    if (outChanged) payload.clock_out = outISO;
    try {
      await callFn('attendance', 'correct', payload);
      toast({ title: 'Marca corregida' });
      onOpenChange(false);
      onDone();
    } catch (err) {
      setError(err.message || 'No se pudo guardar la corrección');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!record} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Corregir marca de {record.user_name || 'la persona'}</DialogTitle>
          <DialogDescription>
            Queda guardado quién corrigió, cuándo y por qué. Lo que había antes no se pierde.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="corr-in">Entrada</Label>
            <Input id="corr-in" type="datetime-local" className="h-11" value={clockIn} onChange={(e) => setClockIn(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="corr-out">Salida</Label>
            <Input id="corr-out" type="datetime-local" className="h-11" value={clockOut} onChange={(e) => setClockOut(e.target.value)} />
            {wasOpen ? <p className="text-xs text-muted-foreground">Déjala vacía si la persona sigue dentro.</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="corr-note">Motivo (obligatorio)</Label>
            <Textarea id="corr-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={3}
              placeholder="p. ej. olvidó checar su salida" />
          </div>
          {!inChanged && !outChanged ? (
            <p className="text-xs text-muted-foreground">Cambia la entrada o la salida para poder guardar.</p>
          ) : null}
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="ghost" className="h-11" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" className="h-11" disabled={!canSubmit}>{busy ? 'Guardando…' : 'Guardar corrección'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Cierre a ciegas (contrato §5 shifts.close): pide SOLO lo contado. El
// servidor calcula el esperado después; si hay diferencia responde
// 409 comment_required sin cifras y aquí se pide el comentario. Esta pantalla
// nunca muestra esperado ni diferencia mientras se captura.
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { callFn } from '@/lib/api';
import { toast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import MoneyField from './MoneyField';
import { parsePesos } from './helpers';

export default function CloseShiftDialog({ open, onOpenChange, onClosed, onStale }) {
  const [counted, setCounted] = useState('');
  const [step, setStep] = useState('count'); // 'count' | 'comment'
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [openOrders, setOpenOrders] = useState(null); // { count, message }

  const cents = parsePesos(counted);

  const reset = () => {
    setCounted('');
    setComment('');
    setStep('count');
    setOpenOrders(null);
  };

  const handleOpenChange = (v) => {
    if (busy) return;
    if (!v) reset();
    onOpenChange(v);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (cents === null || busy) return;
    if (step === 'comment' && !comment.trim()) return;
    setBusy(true);
    setOpenOrders(null);
    try {
      const payload = { counted_cash: cents };
      if (step === 'comment') payload.comment = comment.trim();
      const res = await callFn('shifts', 'close', payload);
      reset();
      onOpenChange(false);
      onClosed(res);
    } catch (err) {
      if (err.code === 'comment_required') {
        setStep('comment');
      } else if (err.code === 'open_orders') {
        setOpenOrders({ count: err.data?.count ?? 0, message: err.message });
      } else if (err.code === 'no_open_shift') {
        toast({ title: 'Este turno ya se cerró', description: 'Se actualizó la pantalla.' });
        reset();
        onOpenChange(false);
        onStale();
      } else {
        toast({ title: 'No se pudo cerrar el turno', description: err.message, variant: 'destructive' });
      }
    } finally {
      setBusy(false);
    }
  };

  const commentStep = step === 'comment';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Cerrar turno</DialogTitle>
          <DialogDescription>
            {commentStep
              ? 'Lo contado no coincide con lo esperado. Vuelve a contar si quieres; si es correcto, cuenta qué pasó.'
              : 'Cuenta todo el efectivo de la caja y escribe cuánto hay. El sistema compara después.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <MoneyField
            id="counted-cash"
            label="Efectivo contado"
            value={counted}
            onChange={setCounted}
            autoFocus
            hint={counted.trim() !== '' && cents === null ? 'Escribe un monto válido, por ejemplo 1250.50' : undefined}
          />
          {commentStep ? (
            <div className="space-y-1.5">
              <Label htmlFor="close-comment">Comentario (obligatorio)</Label>
              <Textarea
                id="close-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="p. ej. faltó cambio, se pagó una propina en efectivo"
              />
            </div>
          ) : null}
          {openOrders ? (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm space-y-2" role="alert">
              <p>{openOrders.message}</p>
              <Link to="/mesas" className="inline-block font-medium underline underline-offset-2">
                Ir a las mesas
              </Link>
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)} disabled={busy}>
              Volver
            </Button>
            <Button
              type="submit"
              disabled={cents === null || busy || (commentStep && !comment.trim())}
            >
              {busy ? 'Cerrando…' : 'Cerrar turno'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

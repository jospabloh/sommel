// "¿Seguro? Son N piezas" (José, 2026-10-14). The server answers
// 409 qty_confirm_required above the bar's threshold (Ajustes → Servicio);
// confirming resends the same call with confirm_qty: true.
import React, { useCallback, useRef, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ApiError } from '@/lib/api';

/**
 * `withQtyConfirm(call)` runs `call(extra)`; on qty_confirm_required it asks
 * and, if the person confirms, runs `call({ confirm_qty: true })` once more.
 * Resolves to null when the person chose to correct the quantity.
 */
export function useQtyConfirm() {
  const [ask, setAsk] = useState(null);
  const resolver = useRef(null);

  const confirm = useCallback((qty) => new Promise((resolve) => {
    resolver.current = resolve;
    setAsk({ qty });
  }), []);

  const answer = (ok) => {
    setAsk(null);
    resolver.current?.(ok);
    resolver.current = null;
  };

  const withQtyConfirm = useCallback(async (call) => {
    try {
      return await call({});
    } catch (err) {
      if (!(err instanceof ApiError) || err.code !== 'qty_confirm_required') throw err;
      const ok = await confirm(err.data?.qty);
      if (!ok) return null;
      return await call({ confirm_qty: true });
    }
  }, [confirm]);

  const dialog = (
    <AlertDialog open={!!ask} onOpenChange={(v) => !v && answer(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Seguro? Son {ask?.qty ?? 'muchas'} piezas</AlertDialogTitle>
          <AlertDialogDescription>
            Es más de lo normal para un renglón. Revisa que no sea un error de dedo antes de agregarlo.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => answer(false)}>Corregir</AlertDialogCancel>
          <AlertDialogAction onClick={() => answer(true)}>Sí, son {ask?.qty ?? ''}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { withQtyConfirm, dialog };
}

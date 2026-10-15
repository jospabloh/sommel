// Ajustes del servicio (2026-10-14, José): imprimir comandas, entregar solos
// los productos sin estación y el tope de un retiro de efectivo. Cada cambio
// se guarda al momento con settings.update; el servidor valida.
import React, { useState } from 'react';
import { Settings2 } from 'lucide-react';
import { callFn } from '@/lib/api';
import { formatMXN } from '@/lib/money';
import { toast } from '@/components/ui/use-toast';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { parsePesos } from '@/components/shifts/helpers';

function ToggleRow({ id, title, help, checked, disabled, onChange }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-sm font-medium">{title}</Label>
        <p className="text-xs text-muted-foreground">{help}</p>
      </div>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} className="shrink-0" />
    </div>
  );
}

export default function OperationCard({ bar, onSaved }) {
  const [busy, setBusy] = useState(false);
  const currentCap = Number.isInteger(bar?.cash_out_max) && bar.cash_out_max > 0 ? bar.cash_out_max : 0;
  const [capText, setCapText] = useState(currentCap ? String(currentCap / 100) : '');

  const save = async (patch, okTitle) => {
    setBusy(true);
    try {
      const { bar: fresh } = await callFn('settings', 'update', patch);
      onSaved(fresh);
      toast({ title: okTitle });
      return true;
    } catch (err) {
      toast({ title: 'No se pudo guardar', description: err.message, variant: 'destructive' });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const currentQty = Number.isInteger(bar?.qty_confirm_threshold) && bar.qty_confirm_threshold >= 0 ? bar.qty_confirm_threshold : 20;
  const [qtyText, setQtyText] = useState(String(currentQty));
  const qtyNum = qtyText === '' ? null : Number(qtyText);
  const qtyChanged = qtyNum !== null && qtyNum !== currentQty;

  const capCents = capText.trim() === '' ? 0 : parsePesos(capText);
  const capValid = capCents === 0 || (capCents !== null && capCents >= 100);
  const capChanged = capValid && capCents !== currentCap;

  return (
    <div className="bg-card border border-border rounded-xl p-4 sm:p-5 space-y-5">
      <div className="flex items-start gap-2">
        <Settings2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div>
          <h2 className="font-display text-lg font-semibold">Servicio</h2>
          <p className="text-sm text-muted-foreground">Cómo se mandan las comandas, si el inventario puede quedar en negativo, cuándo se confirma una cantidad y cuánto se puede retirar de la caja.</p>
        </div>
      </div>

      <ToggleRow
        id="print-comandas"
        title="Imprimir comandas"
        help="Al enviar a cocina o barra se imprime la comanda en el equipo que imprime Cocina o Barra (Impresión). Al cancelar un platillo ya enviado se imprime el aviso."
        checked={bar?.print_comandas === true}
        disabled={busy}
        onChange={(v) => save({ print_comandas: v }, v ? 'Las comandas se imprimirán' : 'Las comandas ya no se imprimen')}
      />

      <ToggleRow
        id="auto-deliver"
        title="Entregar solos los productos sin estación"
        help="Lo que nadie prepara (agua, un refresco, una botella cerrada) no aparece en Cocina y barra, así que nadie lo podría marcar listo. Encendido, queda entregado en cuanto envías la comanda. Apagado, se queda como enviado."
        checked={bar?.auto_deliver_no_station !== false}
        disabled={busy}
        onChange={(v) => save({ auto_deliver_no_station: v }, v ? 'Se entregarán solos' : 'Ya no se entregan solos')}
      />

      <ToggleRow
        id="allow-negative-stock"
        title="Permitir existencia negativa"
        help="Apagado: no se puede agregar a una comanda ni dar de merma más de lo que hay de un insumo. Encendido: se permite y el insumo queda en negativo hasta el siguiente conteo."
        checked={bar?.allow_negative_stock === true}
        disabled={busy}
        onChange={(v) => save({ allow_negative_stock: v }, v ? 'Se permite existencia negativa' : 'Ya no se permite existencia negativa')}
      />

      <form
        className="space-y-1.5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!qtyChanged || busy) return;
          await save({ qty_confirm_threshold: qtyNum }, qtyNum ? `Se pedirá confirmar arriba de ${qtyNum} piezas` : 'Ya no se pide confirmar la cantidad');
        }}
      >
        <Label htmlFor="qty-confirm">Confirmar la cantidad arriba de (piezas)</Label>
        <div className="flex gap-2">
          <Input
            id="qty-confirm"
            inputMode="numeric"
            value={qtyText}
            onChange={(e) => setQtyText(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
            className="h-11"
          />
          <Button type="submit" className="h-11 shrink-0" disabled={!qtyChanged || busy}>Guardar</Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Un renglón con más piezas pregunta "¿Seguro?" antes de agregarse, para evitar un error de dedo. 0 = nunca preguntar.
        </p>
      </form>

      <form
        className="space-y-1.5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!capChanged || busy) return;
          await save({ cash_out_max: capCents }, capCents ? `Tope de retiro: ${formatMXN(capCents)}` : 'Los retiros ya no tienen tope');
        }}
      >
        <Label htmlFor="cash-out-max">Tope de un retiro de efectivo (pesos)</Label>
        <div className="flex gap-2">
          <Input
            id="cash-out-max"
            inputMode="decimal"
            placeholder="Sin tope"
            value={capText}
            onChange={(e) => setCapText(e.target.value.replace(/[^0-9.]/g, ''))}
            className="h-11"
          />
          <Button type="submit" className="h-11 shrink-0" disabled={!capChanged || busy}>Guardar</Button>
        </div>
        <p className={capValid ? 'text-xs text-muted-foreground' : 'text-xs text-destructive'}>
          {capValid
            ? 'Un retiro mayor se rechaza aunque lo apruebe un administrador. Vacío = sin tope.'
            : 'Escribe al menos $1, o déjalo vacío para no tener tope.'}
        </p>
      </form>
    </div>
  );
}

// Elegir variante (si el producto la exige) + modificadores + cantidad +
// nota, antes de agregar el renglón (contrato §5, pantalla 7). Se abre como
// hoja inferior para no tapar el menú con una mano en un teléfono de 390px.
import React, { useEffect, useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Minus, Plus } from 'lucide-react';
import { formatMXN } from '@/lib/money';

export default function VariantModifierSheet({ product, open, onOpenChange, onConfirm, submitting }) {
  const [variant, setVariant] = useState(null);
  const [modifiers, setModifiers] = useState([]);
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (open) {
      setVariant(null);
      setModifiers([]);
      setQty(1);
      setNotes('');
    }
  }, [open, product?.id]);

  const needsVariant = !!product?.variants?.length;
  const chosenVariant = useMemo(
    () => product?.variants?.find((v) => v.key === variant) ?? null,
    [product, variant]
  );
  const unitPrice = chosenVariant ? chosenVariant.price : product?.price ?? 0;
  const canConfirm = !needsVariant || !!variant;

  const toggleModifier = (key) => {
    setModifiers((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const handleConfirm = () => {
    if (!canConfirm) return;
    onConfirm({
      product_id: product.id,
      variant: needsVariant ? variant : undefined,
      modifiers,
      qty,
      notes: notes.trim(),
    });
  };

  if (!product) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="text-left">
          <SheetTitle>{product.name}</SheetTitle>
        </SheetHeader>

        <div className="space-y-5 mt-4">
          {needsVariant && (
            <div>
              <div className="text-sm font-medium mb-2">Elige un tamaño</div>
              <RadioGroup value={variant ?? ''} onValueChange={setVariant} className="gap-2">
                {product.variants.map((v) => (
                  <label
                    key={v.key}
                    htmlFor={`variant-${v.key}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 cursor-pointer has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                  >
                    <div className="flex items-center gap-2.5">
                      <RadioGroupItem value={v.key} id={`variant-${v.key}`} />
                      <span className="text-sm">{v.label || v.key}</span>
                    </div>
                    <span className="text-sm text-muted-foreground">{formatMXN(v.price)}</span>
                  </label>
                ))}
              </RadioGroup>
            </div>
          )}

          {!!product.modifiers?.length && (
            <div>
              <div className="text-sm font-medium mb-2">Modificadores</div>
              <div className="space-y-2">
                {product.modifiers.map((m) => (
                  <label
                    key={m.key}
                    htmlFor={`mod-${m.key}`}
                    className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 cursor-pointer"
                  >
                    <Checkbox
                      id={`mod-${m.key}`}
                      checked={modifiers.includes(m.key)}
                      onCheckedChange={() => toggleModifier(m.key)}
                    />
                    <span className="text-sm">{m.label || m.key}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="line-notes" className="text-sm font-medium mb-2 block">
              Nota para cocina/barra
            </Label>
            <Textarea
              id="line-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="p. ej. sin hielo, extra caliente…"
              rows={2}
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Cantidad</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="w-10 h-10 rounded-full border border-border flex items-center justify-center active:scale-95"
                aria-label="Menos"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="w-8 text-center font-display text-lg">{qty}</span>
              <button
                type="button"
                onClick={() => setQty((q) => q + 1)}
                className="w-10 h-10 rounded-full border border-border flex items-center justify-center active:scale-95"
                aria-label="Más"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          <Button
            className="w-full h-12 text-base"
            onClick={handleConfirm}
            disabled={!canConfirm || submitting}
          >
            {submitting ? 'Agregando…' : `Agregar · ${formatMXN(unitPrice * qty)}`}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

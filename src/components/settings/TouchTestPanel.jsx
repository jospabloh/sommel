// Ajustes > Esta pantalla > "Probar esta pantalla" (2026-10-13). Says how the
// browser receives the finger on THIS device (real touch or a mouse, as many
// all-in-one touch PCs report it on Windows), plus a list to try scrolling.
// Nothing is sent anywhere: it only reads the pointer events of this page.
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';

const KIND = {
  touch: 'Táctil: el navegador lo recibe como dedo.',
  mouse: 'Mouse: Windows reporta el dedo como mouse. Sommel lo convierte en desplazamiento.',
  pen: 'Lápiz.',
};

export default function TouchTestPanel() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState(null);
  const points = typeof navigator !== 'undefined' ? navigator.maxTouchPoints || 0 : 0;

  if (!open) {
    return (
      <Button type="button" variant="outline" className="h-11" onClick={() => setOpen(true)}>
        Probar esta pantalla
      </Button>
    );
  }
  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <p className="text-sm">
        Toca la lista con el dedo y arrástrala hacia arriba y hacia abajo.
      </p>
      <div
        className="h-56 overflow-y-auto rounded-md border border-border bg-background"
        onPointerDown={(e) => setKind(e.pointerType || 'mouse')}
      >
        {Array.from({ length: 40 }, (_, i) => (
          <div key={i} className="px-3 py-3 border-b border-border text-sm">Renglón de prueba {i + 1}</div>
        ))}
      </div>
      <p className="text-sm font-medium" role="status">
        {kind ? `Tu dedo llega como ${KIND[kind] ?? kind}` : 'Toca la lista para ver cómo llega tu dedo.'}
      </p>
      <p className="text-xs text-muted-foreground">
        Puntos táctiles que reporta el equipo: {points}. Si algo no se siente bien, mándanos una foto de esto.
      </p>
    </div>
  );
}

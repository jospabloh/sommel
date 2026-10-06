// Fallback setup steps, shown only while no USB printer is connected: the
// print dialog path needs an installed printer, and Chrome only skips the
// dialog when started with --kiosk-printing.
import React from 'react';
import { Info } from 'lucide-react';

const STEPS = [
  'Usa Google Chrome en la laptop de caja.',
  'Cierra Chrome por completo y ábrelo con la opción --kiosk-printing. En Windows: clic derecho al acceso directo de Chrome, Propiedades, y al final del campo Destino agrega un espacio y --kiosk-printing. En Mac: open -a "Google Chrome" --args --kiosk-printing. En Linux: google-chrome --kiosk-printing.',
  'En el sistema, deja la Xprinter como impresora predeterminada, con papel de 58 mm.',
  'Abre esta pantalla y déjala abierta, sin cerrar la pestaña ni suspender la laptop.',
  'Prueba primero con la impresión automática apagada: imprime un ticket con su botón y revisa el papel. Cuando salga bien, enciende la impresión automática.',
];

export default function KioskInstructions() {
  return (
    <details className="group bg-card border border-border rounded-xl p-4 sm:p-5">
      <summary className="flex items-center gap-2 cursor-pointer select-none list-none">
        <Info className="w-4 h-4 text-primary shrink-0" />
        <span className="font-display text-base font-semibold">Si no puedes conectar por USB</span>
      </summary>
      <ol className="mt-3 space-y-2 text-sm text-muted-foreground list-decimal pl-5">
        {STEPS.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <p className="mt-3 text-sm text-muted-foreground">
        Sin --kiosk-printing Chrome abre su cuadro de impresión en cada trabajo. Si lo cancelas ahí, el trabajo queda como
        impreso; usa Reimprimir para sacar otra copia.
      </p>
    </details>
  );
}

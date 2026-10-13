// One-time preparation for a USB printer on Windows (2026-10-13). Windows
// binds every USB printer to usbprint.sys and Chrome cannot open it, so the
// station shows this instead of failing every ticket. The download is
// tools/windows-printer (libwdi, inbox WinUSB), built into public/descargas.
import React from 'react';
import { Download, Usb } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const WINDOWS_PREP_URL = '/descargas/sommel-impresora.exe';

const STEPS = [
  'Descarga "Preparar impresora" con el botón de abajo y ábrelo.',
  'Si Windows dice "Windows protegió su PC", pulsa "Más información" y luego "Ejecutar de todas formas". Acepta el permiso de administrador.',
  'Cuando te muestre la impresora, pulsa "Sí". Tarda menos de un minuto.',
  'Desconecta el USB de la impresora y vuelve a conectarlo. Después pulsa aquí "Conectar impresora" otra vez.',
];

export default function WindowsPrinterPrep({ onReconnect }) {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 p-3 sm:p-4 space-y-3">
      <div>
        <p className="font-medium text-amber-900 dark:text-amber-200">Esta computadora necesita un paso, una sola vez</p>
        <p className="text-sm text-amber-800 dark:text-amber-300">
          Windows tiene tomada la impresora con su propio controlador y el navegador no puede usarla. Mientras no la prepares,
          la impresión automática queda apagada y los tickets esperan en la cola.
        </p>
      </div>
      <ol className="list-decimal pl-5 space-y-1 text-sm text-foreground">
        {STEPS.map((s) => <li key={s}>{s}</li>)}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" asChild>
          <a href={WINDOWS_PREP_URL} download>
            <Download /> Preparar impresora
          </a>
        </Button>
        <Button size="sm" variant="outline" onClick={onReconnect}>
          <Usb /> Conectar impresora
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Después de esto Windows ya no la muestra como impresora: solo Sommel imprime en ella. ¿Dudas? soporte@acaciaco.com.mx
      </p>
    </div>
  );
}

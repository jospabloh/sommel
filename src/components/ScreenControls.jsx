// Sidebar buttons that hide the browser's bars: "Pantalla completa" (any
// Chrome/Edge window, until Esc or a reload) and "Instalar Sommel" (its own
// window with no address bar, survives restarts). See CLAUDE.md, 2026-10-06.
import React, { useState } from 'react';
import { Download, Maximize2, Minimize2, Share } from 'lucide-react';
import { useScreenControls } from '@/lib/screen/useScreenControls';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

const BUTTON =
  'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent transition-colors';

export default function ScreenControls() {
  const { canFullscreen, fullscreen, toggleFullscreen, install, runInstall } = useScreenControls();
  const [iosHelp, setIosHelp] = useState(false);

  const fsLabel = fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa';
  const FsIcon = fullscreen ? Minimize2 : Maximize2;

  return (
    <>
      {install && (
        <button
          type="button"
          className={BUTTON}
          title="Instalar Sommel"
          aria-label="Instalar Sommel"
          onClick={() => (install === 'ios' ? setIosHelp(true) : runInstall())}
        >
          <Download className="w-5 h-5 shrink-0" />
          <span className="hidden lg:block">Instalar Sommel</span>
        </button>
      )}
      {canFullscreen && (
        <button type="button" className={BUTTON} title={fsLabel} aria-label={fsLabel} onClick={toggleFullscreen}>
          <FsIcon className="w-5 h-5 shrink-0" />
          <span className="hidden lg:block">{fsLabel}</span>
        </button>
      )}

      <Dialog open={iosHelp} onOpenChange={setIosHelp}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Instalar Sommel en este iPad o iPhone</DialogTitle>
            <DialogDescription>Así se abre sin la barra de Safari, como una app.</DialogDescription>
          </DialogHeader>
          <ol className="list-decimal pl-5 space-y-2 text-sm">
            <li>
              Toca <Share className="inline w-4 h-4 align-text-bottom" aria-label="Compartir" /> Compartir en la barra
              de Safari.
            </li>
            <li>Elige &quot;Agregar a pantalla de inicio&quot;.</li>
            <li>Abre Sommel desde el ícono nuevo.</li>
          </ol>
        </DialogContent>
      </Dialog>
    </>
  );
}

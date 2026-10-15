// "Instalar Sommel" on iPad/iPhone: Safari has no install prompt, so the
// avatar menu opens these steps instead (CLAUDE.md, 2026-10-06).
import React from 'react';
import { Share } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

export default function InstallHelpDialog({ open, onOpenChange }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
  );
}

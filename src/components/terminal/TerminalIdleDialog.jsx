// The last 30 seconds before a terminal locks itself (José, 2026-10-13).
import React from 'react';
import { Lock, Clock } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export default function TerminalIdleDialog({ secondsLeft, onKeep, onLock }) {
  const open = secondsLeft != null;
  return (
    <Dialog open={open}>
      <DialogContent
        className="max-w-sm mx-auto [&>button]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex items-center justify-center mb-3">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
              <Clock className="w-7 h-7 text-primary" />
            </div>
          </div>
          <DialogTitle className="text-center">¿Mantener la sesión abierta?</DialogTitle>
          <DialogDescription className="text-center">
            La terminal se bloqueará por inactividad y habrá que volver a escribir el PIN.
          </DialogDescription>
        </DialogHeader>
        <p className="text-center text-4xl font-black tabular-nums text-foreground my-2" aria-live="polite">
          {secondsLeft ?? 0} s
        </p>
        <div className="grid gap-2">
          <Button className="w-full h-12 text-base" onClick={onKeep}>
            Sí, mantener abierta
          </Button>
          <Button variant="outline" className="w-full" onClick={onLock}>
            <Lock /> No, bloquear ahora
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

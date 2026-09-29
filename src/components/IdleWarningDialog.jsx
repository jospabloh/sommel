import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Clock } from 'lucide-react';

const COUNTDOWN_SECONDS = 2 * 60; // 2 minutes — must match useSessionManager's IDLE_LOGOUT_MS

// Adapted from acacia-app-standard shared/session (module 20): the only change is
// theme tokens instead of a fixed yellow.
export default function IdleWarningDialog({ open, onContinue }) {
  const [seconds, setSeconds] = useState(COUNTDOWN_SECONDS);

  useEffect(() => {
    if (!open) {
      setSeconds(COUNTDOWN_SECONDS);
      return;
    }
    const interval = setInterval(() => {
      setSeconds(s => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [open]);

  const mins = String(Math.floor(seconds / 60)).padStart(2, '0');
  const secs = String(seconds % 60).padStart(2, '0');

  return (
    <Dialog open={open}>
      <DialogContent className="max-w-sm mx-auto" onPointerDownOutside={e => e.preventDefault()}>
        <DialogHeader>
          <div className="flex items-center justify-center mb-3">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
              <Clock className="w-7 h-7 text-primary" />
            </div>
          </div>
          <DialogTitle className="text-center">¿Sigues ahí?</DialogTitle>
          <DialogDescription className="text-center">
            Tu sesión cerrará automáticamente por inactividad en:
          </DialogDescription>
        </DialogHeader>

        <div className="text-center my-4">
          <span className="text-4xl font-black text-foreground tabular-nums">
            {mins}:{secs}
          </span>
        </div>

        <Button onClick={onContinue} className="w-full">
          Continuar trabajando
        </Button>
      </DialogContent>
    </Dialog>
  );
}

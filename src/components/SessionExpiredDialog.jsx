import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/AuthContext';
import { ShieldAlert } from 'lucide-react';

// Adapted from acacia-app-standard shared/session (module 20), two changes only:
// re-auth goes to Sommel's own /login (module 10, never Base44's hosted page)
// through AuthContext, and the icon uses theme tokens.
//
// Shown for both causes of a closed session: the local idle timer fired, or
// the server marked this session 'revoked' (the Module 20 stale-session
// reap job, or an admin's remote force-logout) — the user doesn't need to
// know which; either way the only two sane actions are re-auth or sign out.
export default function SessionExpiredDialog({ open }) {
  const { logout, navigateToLogin } = useAuth();
  // Clear the dead token first so /login does not bounce straight back in.
  const handleLogin = () => {
    logout(false);
    navigateToLogin();
  };
  const handleLogout = () => logout();

  return (
    <Dialog open={open}>
      <DialogContent className="max-w-sm mx-auto" onPointerDownOutside={e => e.preventDefault()}>
        <DialogHeader>
          <div className="flex items-center justify-center mb-3">
            <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
              <ShieldAlert className="w-7 h-7 text-destructive" />
            </div>
          </div>
          <DialogTitle className="text-center">Sesión expirada</DialogTitle>
          <DialogDescription className="text-center">
            Tu sesión ha expirado por inactividad. Vuelve a iniciar sesión para continuar.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 mt-2">
          <Button onClick={handleLogin} className="w-full">
            Volver a iniciar sesión
          </Button>
          <Button variant="outline" onClick={handleLogout} className="w-full">
            Cerrar sesión completamente
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

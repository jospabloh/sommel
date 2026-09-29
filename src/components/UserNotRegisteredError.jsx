import React from "react";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import AuthLayout, { SUPPORT_EMAIL } from "@/components/AuthLayout";
import { useAuth } from "@/lib/AuthContext";

// Shown when the signed-in account has no access to Sommel (Base44's
// `user_not_registered`). Same AuthLayout shell as the login screens, theme
// tokens only, in Spanish, with a way out: switch account or write to support.
const UserNotRegisteredError = () => {
  const { logout } = useAuth();

  const switchAccount = () => {
    logout(false);
    window.location.assign("/login");
  };

  return (
    <AuthLayout
      icon={ShieldAlert}
      title="Esta cuenta no tiene acceso"
      subtitle="Tu correo no está registrado en Sommel."
    >
      <div className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Qué puedes hacer</p>
        <ul className="mt-2 list-disc list-inside space-y-1">
          <li>Confirma que iniciaste sesión con el correo correcto.</li>
          <li>Pide a la persona que administra tu bar que te invite.</li>
          <li>Si crees que es un error, escríbenos a {SUPPORT_EMAIL}.</li>
        </ul>
      </div>
      <Button className="mt-6 h-12 w-full font-medium" onClick={switchAccount}>
        Usar otra cuenta
      </Button>
    </AuthLayout>
  );
};

export default UserNotRegisteredError;

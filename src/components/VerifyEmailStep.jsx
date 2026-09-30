import React, { useState } from "react";
import { Mail, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import AuthLayout from "@/components/AuthLayout";
import { toast } from "@/components/ui/use-toast";
import { friendlyAuthError } from "@/lib/authErrors";

// Email verification by code, shared by Register (right after sign-up) and
// Login (an account that never verified). Without this step Base44 sends the
// code and the app gives the person nowhere to type it.
//
// After a good code: use the token verifyOtp returns, else sign in with the
// password we already have, else send the person to /login. `onDone(next)`
// receives "app" (session ready) or "login".
export default function VerifyEmailStep({ email, password, onDone, onCancel }) {
  const [otpCode, setOtpCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleVerify = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await base44.auth.verifyOtp({ email, otpCode });
      if (result?.access_token) {
        base44.auth.setToken(result.access_token);
        onDone("app");
        return;
      }
    } catch (err) {
      setError(friendlyAuthError(err, "No pudimos verificar el código. Inténtalo de nuevo.", "verify"));
      setLoading(false);
      return;
    }
    // Verified but no token came back: sign in with the password we have.
    try {
      if (!password) throw new Error("no password");
      await base44.auth.loginViaEmailPassword(email, password);
      onDone("app");
    } catch {
      toast({ title: "Correo verificado", description: "Inicia sesión para continuar." });
      onDone("login");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError("");
    try {
      await base44.auth.resendOtp(email);
      toast({ title: "Código enviado", description: "Revisa tu correo para ver el código nuevo." });
    } catch (err) {
      setError(friendlyAuthError(err, "No pudimos reenviar el código. Inténtalo de nuevo.", "verify"));
    }
  };

  return (
    <AuthLayout icon={Mail} title="Verifica tu correo" subtitle={`Enviamos un código a ${email}`}>
      {error && (
        <div role="alert" className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}
      <p className="text-center text-xs text-muted-foreground mb-4">
        Te llega en inglés, de no-reply@base44-apps.com, con el asunto "Verify your email for Sommel". Revisa también en spam.
      </p>
      <div className="flex justify-center mb-6">
        <InputOTP maxLength={6} value={otpCode} onChange={setOtpCode} autoFocus autoComplete="one-time-code">
          <InputOTPGroup>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <InputOTPSlot key={i} index={i} />
            ))}
          </InputOTPGroup>
        </InputOTP>
      </div>
      <Button className="w-full h-12 font-medium" onClick={handleVerify} disabled={loading || otpCode.length < 6}>
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Verificando...
          </>
        ) : (
          "Verificar"
        )}
      </Button>
      <div className="flex justify-between text-sm mt-4">
        <button type="button" onClick={handleResend} className="text-primary font-medium hover:underline">
          Reenviar código
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-muted-foreground hover:text-foreground">
            Usar otro correo
          </button>
        )}
      </div>
    </AuthLayout>
  );
}

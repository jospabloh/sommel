// Spanish messages for Base44 auth failures. The SDK surfaces the backend's
// English text (or a bare "Network Error"); users get a sentence they can act
// on. Unknown messages fall back to `fallback` instead of leaking raw text.
// context: "login" | "register" | "verify" | "reset"

// True when a login failed only because the account's email was never
// verified (Base44 answers with an English "verify your email" / "verification
// code" message). Login uses it to open the code step instead of an error.
export function needsEmailVerification(err) {
  return /not verified|unverified|verify your email|verification code|email.*verif/i.test(
    String(err?.message || err?.response?.data?.message || err?.response?.data?.detail || "")
  );
}

export function friendlyAuthError(err, fallback, context = "login") {
  const status = err?.status ?? err?.response?.status;
  const raw = String(err?.message || "").toLowerCase();

  if (status === 429 || /too many|rate limit|throttl/.test(raw)) {
    return "Demasiados intentos. Espera unos minutos y vuelve a intentarlo.";
  }
  if (!status && (/network|failed to fetch|timeout|load failed/.test(raw) || err?.code === "ERR_NETWORK")) {
    return "No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.";
  }
  if (status >= 500) {
    return "El servicio no responde en este momento. Inténtalo de nuevo en unos minutos.";
  }
  if (needsEmailVerification(err)) {
    return "Tu correo aún no está verificado. Revisa tu bandeja (y spam) por el código de verificación.";
  }
  if (context === "login" && (status === 400 || status === 401 || status === 403 || status === 404 ||
      /invalid|incorrect|credential|wrong|not found|unauthorized/.test(raw))) {
    return "Correo o contraseña incorrectos.";
  }
  if (context === "register") {
    if (/already|exist|taken|registered/.test(raw)) {
      return "Ya existe una cuenta con ese correo. Inicia sesión o restablece tu contraseña.";
    }
    if (/password/.test(raw)) {
      return "La contraseña no cumple los requisitos. Usa al menos 8 caracteres.";
    }
  }
  if (context === "verify" && (status === 400 || status === 401 || /invalid|expired|otp|code/.test(raw))) {
    return "El código es incorrecto o ya venció. Pide uno nuevo con «Reenviar».";
  }
  if (context === "reset" && (status === 400 || status === 401 || /invalid|expired|token/.test(raw))) {
    return "El enlace ya no es válido o venció. Solicita uno nuevo.";
  }
  return fallback;
}

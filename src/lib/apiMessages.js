// Spanish text for a failed function call when the server did not send its
// own (`{ error }`). Base44 answers some failures itself, before our function
// runs (a 429 from its rate limit, a 502/504 from its gateway, a dropped
// connection), and then axios only has English ("Request failed with status
// code 429", "Network Error") that used to reach the toasts as they were.
// No imports: tested in Deno (base44/tests/api_messages_test.ts).

const AXIOS_GENERIC = /^Request failed with status code \d+$/i;

/**
 * @param {number} status HTTP status, 0 when there was no response at all.
 * @param {string} [raw] The error's own message (axios / fetch text).
 * @returns {string}
 */
export function friendlyHttpMessage(status, raw) {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!status) {
    return 'No hay conexión con el servidor. Revisa tu internet e intenta de nuevo.';
  }
  if (status === 429) return 'Hay muchas solicitudes seguidas. Espera unos segundos e intenta de nuevo.';
  if (status === 401) return 'Tu sesión ya no es válida. Vuelve a iniciar sesión.';
  if (status === 403) return 'No tienes permiso para hacer esto.';
  if (status === 404) return 'No se encontró lo que buscabas. Recarga la página e intenta de nuevo.';
  if (status >= 500) return 'El servidor tuvo un problema. Intenta de nuevo en un momento.';
  // Another 4xx whose text is not axios' generic one is the server's own words.
  if (text && !AXIOS_GENERIC.test(text)) return text;
  return 'No se pudo completar. Intenta de nuevo.';
}

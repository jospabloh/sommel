// Star CloudPRNT on the client (2026-10-06). Import-free except the app id, so
// base44/tests/cloudprnt_test.ts can load the pure parts.

/** Kinds a person chooses from (same four as "Qué imprime este equipo"). */
export const CLOUD_KINDS = ['cocina', 'barra', 'ticket', 'corte'];

/** The URL typed into the printer's CloudPRNT settings. */
export function cloudPrntUrl(origin, appId) {
  return `${String(origin).replace(/\/$/, '')}/api/apps/${appId}/functions/cloudprnt`;
}

/** "Hace 2 min", "Nunca": how fresh the printer's last poll is. */
export function lastSeenLabel(iso, nowMs = Date.now()) {
  const t = Date.parse(iso ?? '');
  if (Number.isNaN(t)) return 'Nunca se ha conectado';
  const min = Math.floor((nowMs - t) / 60000);
  if (min < 2) return 'Conectada';
  if (min < 60) return `Última conexión hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `Última conexión hace ${h} h`;
  return `Última conexión hace ${Math.floor(h / 24)} días`;
}

/** Online = polled in the last 2 minutes (it writes at most once a minute). */
export function isOnline(iso, nowMs = Date.now()) {
  const t = Date.parse(iso ?? '');
  return !Number.isNaN(t) && nowMs - t < 2 * 60000;
}

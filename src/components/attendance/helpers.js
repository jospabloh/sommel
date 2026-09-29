// Helpers de las pantallas de asistencia. La UI solo formatea y captura: el
// servidor decide entradas, salidas, minutos y totales (contrato §3).

// Aguascalientes: UTC-6 fijo desde 2022, igual que America/Mexico_City.
const TZ = 'America/Mexico_City';
const OFFSET_MS = -6 * 60 * 60 * 1000;

export function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('es-MX', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
}

export function fmtDay(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-MX', { timeZone: TZ, weekday: 'short', day: '2-digit', month: 'short' });
}

/** 125 -> "2 h 05 min"; 45 -> "45 min"; 0 -> "0 min". */
export function fmtDuration(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} min`;
  return `${h} h ${String(r).padStart(2, '0')} min`;
}

/** Fecha local 'YYYY-MM-DD' de un instante (por defecto, ahora). */
export function localDate(date = new Date()) {
  return new Date(date.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

/** Suma días a una fecha local 'YYYY-MM-DD'. */
export function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Lunes de la semana de una fecha local. */
export function weekStart(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = domingo
  return addDays(dateStr, -((dow + 6) % 7));
}

/** Instante ISO -> valor para <input type="datetime-local"> en hora del bar. */
export function toLocalInput(iso) {
  if (!iso) return '';
  return new Date(new Date(iso).getTime() + OFFSET_MS).toISOString().slice(0, 16);
}

/** Valor de <input type="datetime-local"> (hora del bar) -> instante ISO, o null. */
export function fromLocalInput(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(value ?? ''));
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])) - OFFSET_MS;
  return new Date(t).toISOString();
}

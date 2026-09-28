// Display helpers for Reportes. The bar's day is Aguascalientes local time,
// a fixed UTC-6 all year (contract §1), so "today" is computed from that
// offset and NOT from the browser's timezone. Nothing here touches money.

const BAR_UTC_OFFSET_MIN = -360;
const DAY_MS = 86_400_000;
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Shifts an instant into bar-local time; read the result with getUTC*. */
function toBarLocal(date) {
  return new Date(date.getTime() + BAR_UTC_OFFSET_MIN * 60_000);
}

/** 'YYYY-MM-DD' of the bar's current local day. */
export function barToday(now = new Date()) {
  return toBarLocal(now).toISOString().slice(0, 10);
}

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Monday of the current bar-local week through today. */
export function thisWeekRange(now = new Date()) {
  const today = barToday(now);
  const dow = toBarLocal(now).getUTCDay(); // 0 = Sunday
  const sinceMonday = (dow + 6) % 7;
  return { from: addDays(today, -sinceMonday), to: today };
}

/** Inclusive number of days between two 'YYYY-MM-DD' strings. */
export function daysBetween(from, to) {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / DAY_MS) + 1;
}

/** '28 sep 2026' from 'YYYY-MM-DD'. */
export function fmtDay(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** '28 sep 2026' for one day, '22 al 28 sep 2026' style for a span. */
export function fmtRange(range) {
  if (!range) return '';
  if (range.from === range.to) return fmtDay(range.from);
  return `${fmtDay(range.from)} al ${fmtDay(range.to)}`;
}

/** '28 sep, 14:05' in bar-local time from an ISO instant. */
export function fmtLocalTime(iso) {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const l = toBarLocal(new Date(t));
  const hh = String(l.getUTCHours()).padStart(2, '0');
  const mm = String(l.getUTCMinutes()).padStart(2, '0');
  return `${l.getUTCDate()} ${MONTHS[l.getUTCMonth()]}, ${hh}:${mm}`;
}

/** Percent change of `current` vs `previous`, or null when it has no meaning. */
export function pctChange(current, previous) {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

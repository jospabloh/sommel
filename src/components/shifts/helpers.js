// Helpers de la pantalla de Turno. La UI solo formatea y captura: el servidor
// calcula esperado, diferencia y todo total (contrato §1/§5).
import { pesosToCents } from '@/lib/money';

// Aguascalientes: UTC-6 fijo desde 2022, igual que America/Mexico_City.
const TZ = 'America/Mexico_City';

export function fmtDateTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-MX', {
    timeZone: TZ,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('es-MX', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
}

export function fmtDay(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-MX', { timeZone: TZ, weekday: 'short', day: '2-digit', month: 'short' });
}

/**
 * "1,250.50" o "1250.5" -> centavos enteros. Devuelve null si no es un monto
 * válido (vacío, negativo, más de dos decimales).
 */
export function parsePesos(text) {
  const clean = String(text ?? '').replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return pesosToCents(clean);
}

export function newKey() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `k-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Texto para el estado del correo del corte. */
export function emailStatusInfo(status, error, detailed) {
  if (status === 'enviado') return { tone: 'ok', text: 'Corte enviado por correo' };
  if (status === 'fallido') {
    if (error === 'sin_destinatarios') {
      return { tone: 'warn', text: 'No hay correos configurados para el corte. Agrégalos en Ajustes y reenvía.' };
    }
    return {
      tone: 'warn',
      text: detailed && error ? `No se pudo enviar el correo: ${error}` : 'No se pudo enviar el correo del corte',
    };
  }
  return { tone: 'idle', text: 'Correo del corte pendiente' };
}

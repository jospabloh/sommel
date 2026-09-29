// Pure logic for the persistent license banner (Layout.jsx). No imports, so it
// can be reasoned about (and tested) without React. The SERVER decides what a
// billing status allows (`requireWritable`); this only chooses the sentence
// the person reads, and never gates anything on the client.

const DAY_MS = 24 * 60 * 60 * 1000;

export const SUPPORT_EMAIL = 'soporte@acaciaco.com.mx';

/** Whole days left until `trialEndAt` (rounded up). Null if the date is unusable. */
export function trialDaysLeft(trialEndAt, now = new Date()) {
  if (!trialEndAt) return null;
  const end = new Date(trialEndAt).getTime();
  if (Number.isNaN(end)) return null;
  return Math.ceil((end - now.getTime()) / DAY_MS);
}

/**
 * @param {{ billing_status?: string|null, trial_end_at?: string|null }|null|undefined} bar
 * @returns {null | { kind: 'view_only'|'suspended'|'trial', tone: 'danger'|'warning'|'info', title: string, text: string }}
 */
export function billingNotice(bar, now = new Date()) {
  if (!bar) return null;
  switch (bar.billing_status) {
    case 'suspended':
      return {
        kind: 'suspended',
        tone: 'danger',
        title: 'Cuenta suspendida',
        text: 'Tu licencia está suspendida y no se pueden registrar cambios. Escríbenos para reactivarla.',
      };
    case 'view_only':
      return {
        kind: 'view_only',
        tone: 'warning',
        title: 'Solo lectura',
        text: 'Tu licencia venció: puedes consultar tu información, pero no registrar cambios. Escríbenos para renovarla.',
      };
    case 'trial': {
      const days = trialDaysLeft(bar.trial_end_at, now);
      if (days === null) return null;
      if (days <= 0) {
        return {
          kind: 'trial',
          tone: 'warning',
          title: 'Tu prueba terminó',
          text: 'El periodo de prueba ya venció. Escríbenos para activar tu licencia.',
        };
      }
      return {
        kind: 'trial',
        tone: days <= 3 ? 'warning' : 'info',
        title: 'Periodo de prueba',
        text: days === 1 ? 'Te queda 1 día de prueba.' : `Te quedan ${days} días de prueba.`,
      };
    }
    default:
      return null;
  }
}

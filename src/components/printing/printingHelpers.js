// Small helpers for the print station. Browser storage is wrapped in
// try/catch everywhere: private windows and blocked site data make the
// accessor itself throw.

const DEVICE_KEY = 'sommel.print.deviceId';
const AUTO_KEY = 'sommel.print.auto';

let memoryDeviceId = null;

function randomId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {
    // fall through
  }
  return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Stable per browser profile; falls back to a per-session id without storage. */
export function getDeviceId() {
  try {
    const saved = localStorage.getItem(DEVICE_KEY);
    if (saved) return saved;
    const fresh = randomId();
    localStorage.setItem(DEVICE_KEY, fresh);
    return fresh;
  } catch {
    if (!memoryDeviceId) memoryDeviceId = randomId();
    return memoryDeviceId;
  }
}

/** Auto print is OFF until someone turns it on (contract §6). */
export function readAutoPref() {
  try {
    return localStorage.getItem(AUTO_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeAutoPref(on) {
  try {
    localStorage.setItem(AUTO_KEY, on ? '1' : '0');
  } catch {
    // preference simply does not persist
  }
}

export const KIND_LABELS = {
  cocina: 'Cocina',
  barra: 'Barra',
  cambio: 'Cambio',
  ticket: 'Ticket',
  corte: 'Corte',
};

export function jobTitle(job) {
  if (job?.title) return job.title;
  return KIND_LABELS[job?.kind] || 'Trabajo de impresión';
}

export function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

/** Last four characters of a device id, enough to tell stations apart. */
export function shortDevice(id) {
  return id ? String(id).slice(-4) : '';
}

/** Events from PrintJob.subscribe() carry the row under `data`. */
export function eventRow(evt) {
  if (!evt) return null;
  const row = evt.data && typeof evt.data === 'object' ? evt.data : {};
  return { ...row, id: row.id || evt.id };
}

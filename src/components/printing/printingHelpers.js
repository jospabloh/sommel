// Small helpers for the print station. Browser storage is wrapped in
// try/catch everywhere: private windows and blocked site data make the
// accessor itself throw.

const DEVICE_KEY = 'sommel.print.deviceId';
const AUTO_KEY = 'sommel.print.auto';
const KINDS_KEY = 'sommel.print.kinds';

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

/** This device's explicit choice: true, false, or null when nobody chose.
 *  The station turns null into "on with a USB printer, off without". */
export function readAutoPref() {
  try {
    const v = localStorage.getItem(AUTO_KEY);
    return v === '1' ? true : v === '0' ? false : null;
  } catch {
    return null;
  }
}

export function writeAutoPref(on) {
  try {
    localStorage.setItem(AUTO_KEY, on ? '1' : '0');
  } catch {
    // preference simply does not persist
  }
}

// ---- What this device prints (2026-10-06). With two printers, the kitchen one
// takes comandas and the caja one tickets and cortes. Stored per browser, like
// the auto switch; null = everything (the default, as before).

/** Kinds a person chooses from. 'cambio' (a comanda change) rides with cocina/barra. */
export const CHOOSABLE_KINDS = ['cocina', 'barra', 'ticket', 'corte'];

/** The saved choice, or null for "todo". Unknown or empty values read as null. */
export function readKinds() {
  try {
    const raw = JSON.parse(localStorage.getItem(KINDS_KEY) || 'null');
    return normalizeKinds(raw);
  } catch {
    return null;
  }
}

export function writeKinds(kinds) {
  try {
    const clean = normalizeKinds(kinds);
    if (clean === null) localStorage.removeItem(KINDS_KEY);
    else localStorage.setItem(KINDS_KEY, JSON.stringify(clean));
  } catch {
    // preference simply does not persist
  }
}

/** Known choosable kinds; all of them (or none, or garbage) = null ("todo"). */
export function normalizeKinds(raw) {
  if (!Array.isArray(raw)) return null;
  const set = CHOOSABLE_KINDS.filter((k) => raw.includes(k));
  if (set.length === 0 || set.length === CHOOSABLE_KINDS.length) return null;
  return set;
}

/** What claimNext gets: null (every kind) or the choice plus 'cambio' with cocina/barra. */
export function kindsForClaim(kinds) {
  const clean = normalizeKinds(kinds);
  if (clean === null) return null;
  return clean.includes('cocina') || clean.includes('barra') ? [...clean, 'cambio'] : clean;
}

/** Whether this device takes the job (auto print only waits on its own kinds). */
export function jobMatchesKinds(job, kinds) {
  const claim = kindsForClaim(kinds);
  return claim === null || claim.includes(job?.kind);
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

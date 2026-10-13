// Direct USB printing (WebUSB, Chrome and Edge). No driver and no print
// dialog: the station sends ESC/POS bytes straight to the printer. The person
// picks the printer once; Chrome remembers the permission, so after a reload
// `findPaired()` reconnects without asking.
//
// Messages here are shown to the cashier, so they say what to do next.

const OUT_CHUNK = 4096;

export function usbSupported() {
  return typeof navigator !== 'undefined' && !!navigator.usb && typeof window !== 'undefined' && window.isSecureContext;
}

/** The first interface with a bulk OUT endpoint, which is where a receipt
 *  printer takes its data. */
function findOut(device) {
  for (const itf of device.configuration?.interfaces ?? []) {
    for (const alt of itf.alternates ?? [itf.alternate]) {
      const ep = (alt?.endpoints ?? []).find((e) => e.direction === 'out' && e.type === 'bulk');
      if (ep) return { interfaceNumber: itf.interfaceNumber, endpointNumber: ep.endpointNumber };
    }
  }
  return null;
}

export function printerName(device) {
  if (!device) return '';
  const name = [device.manufacturerName, device.productName].filter(Boolean).join(' ').trim();
  return name || 'Impresora USB';
}

/** A printer this browser was already allowed to use, or null. */
export async function findPaired() {
  if (!usbSupported()) return null;
  try {
    const devices = await navigator.usb.getDevices();
    return devices[0] ?? null;
  } catch {
    return null;
  }
}

/** Opens Chrome's device picker. Must run inside a click. */
export async function choosePrinter() {
  if (!usbSupported()) throw new Error('Este navegador no conecta impresoras USB. Usa Google Chrome o Microsoft Edge.');
  try {
    return await navigator.usb.requestDevice({ filters: [] });
  } catch (err) {
    if (err?.name === 'NotFoundError') return null; // picker closed without choosing
    throw err;
  }
}

async function ready(device) {
  if (!device.opened) await device.open();
  if (!device.configuration) await device.selectConfiguration(1);
  const out = findOut(device);
  if (!out) throw new Error('Ese dispositivo no acepta impresión. Elige la impresora de tickets.');
  try {
    await device.claimInterface(out.interfaceNumber);
  } catch (err) {
    // Already ours from a previous job is fine; anything else is another
    // program (often a Windows driver) holding the printer.
    if (!/already claimed|claimed by this/i.test(err?.message ?? '')) {
      throw new Error('Otro programa está usando la impresora. Cierra el programa de la impresora o desconecta y vuelve a conectar el cable.');
    }
  }
  return out;
}

export const WINDOWS_DRIVER_MESSAGE =
  'Windows tiene tomada la impresora con su propio controlador, así que el navegador no puede usarla. ' +
  'Mientras tanto, apaga "Imprimir automáticamente" y escríbenos a soporte para dejar este equipo listo.';
export const DISCONNECTED_MESSAGE = 'La impresora se desconectó. Revisa el cable USB y que esté encendida.';

/** The cashier's message for a failure while opening the printer. Chrome
 *  reports both a pulled cable and a printer Windows keeps for its own
 *  driver (usbprint.sys, bound to every USB printer by default) as
 *  NetworkError; only the second says "Access denied". Telling those apart
 *  matters: the cable advice sends someone to replug a printer that is fine.
 *  Returns null for errors that already carry a message for the cashier. */
export function openErrorMessage(err) {
  const text = `${err?.name ?? ''} ${err?.message ?? ''}`;
  if (/access denied/i.test(text)) return WINDOWS_DRIVER_MESSAGE;
  if (err?.name === 'NotFoundError' || err?.name === 'NetworkError') return DISCONNECTED_MESSAGE;
  return null;
}

/** Sends bytes to the printer. Throws a message meant for the cashier. */
export async function sendBytes(device, bytes) {
  if (!device) throw new Error('No hay impresora conectada.');
  let out;
  try {
    out = await ready(device);
  } catch (err) {
    console.warn('[usbPrinter] open failed', err?.name, err?.message);
    const message = openErrorMessage(err);
    if (message) throw new Error(message);
    throw err;
  }
  for (let i = 0; i < bytes.length; i += OUT_CHUNK) {
    const result = await device.transferOut(out.endpointNumber, bytes.slice(i, i + OUT_CHUNK));
    if (result.status !== 'ok') throw new Error('La impresora no recibió el ticket. Revisa papel y tapa.');
  }
}

export async function forget(device) {
  try {
    if (device?.opened) await device.close();
  } catch {
    // closing a gone device is fine
  }
  try {
    await device?.forget?.();
  } catch {
    // older Chrome: the permission stays, the station just stops using it
  }
}

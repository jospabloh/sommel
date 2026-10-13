// Deno tests for the open-error message in src/components/printing/usbPrinter.js.
// On Windows every USB printer is bound to usbprint.sys, and Chrome cannot open
// it: the error is a NetworkError, the same name a pulled cable gets. Found on
// a Wansoft POS on 2026-10-13, where the cashier was told to check a cable that
// was fine.
//   deno test --allow-env base44/tests/usb_printer_test.ts
// @ts-ignore: plain JS module shared with the client bundle
import { openErrorMessage, WINDOWS_DRIVER_MESSAGE, DISCONNECTED_MESSAGE } from '../../src/components/printing/usbPrinter.js';

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg ?? 'assertEquals'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

Deno.test('Windows holding the printer is not reported as a pulled cable', () => {
  const err = { name: 'NetworkError', message: "Failed to execute 'open' on 'USBDevice': Access denied." };
  assertEquals(openErrorMessage(err), WINDOWS_DRIVER_MESSAGE);
});

Deno.test('a printer that really went away still gets the cable advice', () => {
  assertEquals(openErrorMessage({ name: 'NotFoundError', message: 'The device was disconnected.' }), DISCONNECTED_MESSAGE);
  assertEquals(openErrorMessage({ name: 'NetworkError', message: 'A transfer error has occurred.' }), DISCONNECTED_MESSAGE);
});

Deno.test('errors that already speak to the cashier pass through', () => {
  assertEquals(openErrorMessage(new Error('Ese dispositivo no acepta impresión. Elige la impresora de tickets.')), null);
  assertEquals(openErrorMessage(null), null);
});

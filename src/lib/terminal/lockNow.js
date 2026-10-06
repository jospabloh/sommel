import { callFn } from '@/lib/api';
import { lockTerminal } from '@/lib/terminal/terminalStore';

/**
 * Locks the terminal here AND on the server: the lock action bumps the
 * device's pass epoch, so the pass in use stops working even if someone kept
 * a copy. The screen locks right away; the server call is best effort.
 */
export function lockNow() {
  lockTerminal();
  callFn('terminals', 'lock').catch(() => {});
}

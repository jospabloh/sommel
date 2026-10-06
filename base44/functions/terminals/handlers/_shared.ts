import { HttpError, httpError, type Ctx } from '../_guard.ts';
import { LogicError } from '../_terminal_logic.ts';
import { PlatformError } from '../_platform.ts';

/** Runs pure logic / platform calls and maps their errors to HTTP. */
export async function mapErrors<T>(fn: () => Promise<T> | T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof LogicError) throw new HttpError(400, err.code, err.message);
    if (err instanceof PlatformError) {
      throw new HttpError(err.code === 'not_configured' ? 503 : 502, err.code, err.message);
    }
    throw err;
  }
}

/** Managing terminals is for the bar's admin, from their own sign-in. */
export function requireBarAdmin(ctx: Ctx): string {
  if (!ctx.tenantId || ctx.appRole !== 'bar_admin') {
    httpError(403, 'forbidden', 'Solo el administrador del bar maneja las terminales');
  }
  return ctx.tenantId as string;
}

/** Terminal-only actions. */
export function requireTerminal(ctx: Ctx): any {
  if (!ctx.terminal?.device) httpError(403, 'not_terminal', 'Esta acción solo se usa desde una terminal');
  return ctx.terminal!.device;
}

/** Members who can work at a terminal: bar roles only, never another terminal. */
export async function barPeople(ctx: Ctx, tenantId: string): Promise<any[]> {
  const users = await ctx.svc.entities.User.filter({ tenant_id: tenantId });
  return users.filter((u: any) => u.app_role === 'bar_admin' || u.app_role === 'staff');
}

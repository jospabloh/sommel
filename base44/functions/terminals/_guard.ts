// Common server guard (entrega-1-contratos.md §2). CANONICAL COPY.
//
// Nobody edits a copy of this file directly — it lives at
// `base44/functions/{catalog,orders,stations}/_guard.ts`, put there by
// `npm run generate:guards`, and `npm run check:guards` (run in CI) fails if
// any copy drifts from this template. To change the guard's behavior, edit
// THIS file and regenerate.
//
// The pure parts (permission precedence, the billing gate, money helpers)
// live in `_guard_logic.ts` (zero imports, so `deno test` can load it
// without `deno.land`/`jsr.io`, which are blocked in this sandbox) — this
// file only adds the network-facing plumbing: the Base44 client, re-reading
// the caller's own `User` row, and loading the `WineBar`.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import {
  PERMISSION_DEFAULTS,
  resolvePermission,
  isBlockedBillingStatus,
  rowBelongsToTenant,
  HttpError,
  isValidCents,
  sumCents,
  lineTotalCents,
  pesosToCents,
  centsToPesos,
  redactItemCost,
  redactItemCosts,
  BAR_UTC_OFFSET_MIN,
  DEFAULT_PAYMENT_METHODS,
  computeOrderTotals,
  activePaymentsTotal,
  pickSurvivor,
  padLine,
  localDayRange,
  localDateString,
  localHour,
  splitEqual,
  isRateLimitError,
  tenantAccessDenied,
  routeAllowsNoTenant,
  TERMINAL_APP_ROLE,
  PASS_TTL_MS,
  signPass,
  verifyPass,
  randomHex,
  terminalAllows,
  personMayUseTerminal,
  routeAllowsLockedTerminal,
  type AppRole,
  type PaymentMethodDef,
} from './_guard_logic.ts';

export {
  PERMISSION_DEFAULTS,
  HttpError,
  isValidCents,
  sumCents,
  lineTotalCents,
  pesosToCents,
  centsToPesos,
  redactItemCost,
  redactItemCosts,
  BAR_UTC_OFFSET_MIN,
  DEFAULT_PAYMENT_METHODS,
  computeOrderTotals,
  activePaymentsTotal,
  pickSurvivor,
  padLine,
  localDayRange,
  localDateString,
  localHour,
  splitEqual,
  isRateLimitError,
  tenantAccessDenied,
  routeAllowsNoTenant,
  TERMINAL_APP_ROLE,
  PASS_TTL_MS,
  signPass,
  randomHex,
  terminalAllows,
  personMayUseTerminal,
};
export type { PaymentMethodDef };

export interface Ctx {
  base44: ReturnType<typeof createClientFromRequest>;
  svc: ReturnType<typeof createClientFromRequest>['asServiceRole'];
  user: any; // base44.auth.me() result
  self: any; // fresh User row, read with asServiceRole (module 22) — never trust auth.me()'s own .data
  tenantId: string | null;
  appRole: AppRole | null;
  isPlatform: boolean;
  bar: any | null; // WineBar row, loaded when tenantId is set
  // Set when the call comes from an authorized terminal (terminal mode).
  // `device` is the stored TerminalDevice row (server-only: it holds the
  // pass key, never return it). With a valid pass, user/self/appRole above
  // are the PERSON who unlocked it; without one (only on routes marked
  // `allowLockedTerminal`) they are the terminal account and appRole is null.
  terminal: { device: any; unlocked: boolean } | null;
}

/**
 * Builds the request context. Always re-reads the `User` row with
 * `asServiceRole` (module 22) instead of trusting `base44.auth.me()`'s own
 * `.data` — that is what StockFlow's `hasPermission()` precedence assumes
 * and what keeps a stale/forged client-side user object from ever being
 * consulted for a permission decision.
 *
 * `allowNoTenant` (default false, module 14) is for platform-only actions
 * (today only `catalog.importMenu`) where the caller is the platform admin
 * with no `tenant_id` at all; individual handlers still gate those with
 * `ctx.isPlatform` explicitly. Every other route answers 403 `no_tenant` to a
 * caller with no bar, platform admin included. Routes opt in with
 * `allowNoTenant(route)` (below), never through a global default.
 */
export async function requireContext(
  req: Request,
  opts: { allowNoTenant?: boolean; allowLockedTerminal?: boolean; terminalPass?: unknown } = {}
): Promise<Ctx> {
  const base44 = createClientFromRequest(req);
  // Fixed 2026-09-28 (D "unauthenticated calls return 500"): an
  // unauthenticated call doesn't make `base44.auth.me()` resolve to `null`
  // — the SDK THROWS ("Authentication required to view users"), which used
  // to escape uncaught, past the `if (!user)` check below that can never
  // run, straight to `handle()`'s generic catch-all and out as 500
  // `internal_error`. That's wrong on two counts: an auth failure is a 401,
  // not a server error, and the message shown to the caller was an SDK
  // internal string, never `entrega-1-contratos.md`'s Spanish-message
  // convention. Wrapping the call and mapping ANY failure here to 401 fixes
  // both; the `if (!user)` fallback stays for an SDK version that returns
  // `null`/`undefined` instead of throwing.
  let user: any;
  try {
    user = await base44.auth.me();
  } catch {
    throw new HttpError(401, 'unauthenticated', 'Inicia sesión para continuar');
  }
  if (!user) throw new HttpError(401, 'unauthenticated', 'Inicia sesión para continuar');
  const svc = base44.asServiceRole;

  const [self] = await svc.entities.User.filter({ id: user.id });
  if (!self) throw new HttpError(401, 'unauthenticated', 'Usuario no encontrado');

  if (self.app_role === TERMINAL_APP_ROLE) {
    return await terminalContext(base44, svc, self, opts);
  }

  const tenantId: string | null = self.tenant_id ?? null;
  const appRole: AppRole | null = self.app_role ?? null;
  // Fixed 2026-09-28: derive isPlatform from the freshly re-read `self` row,
  // not `user` (auth.me()'s own payload) — this function's whole point,
  // stated in its own comment above, is to never trust auth.me() for an
  // access decision. Platform status is the single most powerful one here
  // (it bypasses loadOwned's tenant check and every permission), so it
  // can't be the one field still read off the un-re-read object.
  const isPlatform = self.role === 'admin';

  if (tenantAccessDenied({ tenantId, isPlatform, routeAllowsNoTenant: !!opts.allowNoTenant })) {
    throw new HttpError(403, 'no_tenant', 'No perteneces a ningún bar');
  }

  let bar: any | null = null;
  if (tenantId) {
    const [row] = await svc.entities.WineBar.filter({ id: tenantId });
    bar = row ?? null;
  }

  return { base44, svc, user, self, tenantId, appRole, isPlatform, bar, terminal: null };
}

/**
 * Context for a call signed in as a terminal account. The device must exist,
 * belong to the terminal's bar and not be revoked. With a valid pass the call
 * runs as the person named in it (re-read from User, and re-checked against
 * the device's list); without one it is refused unless the route allows a
 * locked terminal. A terminal is never the platform.
 */
async function terminalContext(
  base44: Ctx['base44'],
  svc: Ctx['svc'],
  self: any,
  opts: { allowLockedTerminal?: boolean; terminalPass?: unknown }
): Promise<Ctx> {
  const [device] = await svc.entities.TerminalDevice.filter({ account_user_id: self.id });
  if (!device || device.revoked_at || !device.tenant_id || device.tenant_id !== self.tenant_id) {
    throw new HttpError(401, 'terminal_revoked', 'Este equipo ya no está autorizado como terminal');
  }
  const [bar] = await svc.entities.WineBar.filter({ id: device.tenant_id });
  if (!bar || bar.archived_at) {
    throw new HttpError(401, 'terminal_revoked', 'Este equipo ya no está autorizado como terminal');
  }

  const pass = opts.terminalPass ? await verifyPass(device.pass_key, device.id, opts.terminalPass, Date.now()) : null;
  if (pass) {
    const [person] = await svc.entities.User.filter({ id: pass.userId });
    if (person && personMayUseTerminal(person, device)) {
      return {
        base44,
        svc,
        user: { id: person.id, email: person.email, full_name: person.full_name },
        self: person,
        tenantId: device.tenant_id,
        appRole: person.app_role as AppRole,
        isPlatform: false,
        bar,
        terminal: { device, unlocked: true },
      };
    }
  }
  if (!opts.allowLockedTerminal) {
    throw new HttpError(401, 'terminal_locked', 'La terminal está bloqueada. Pon tu PIN para continuar');
  }
  return {
    base44,
    svc,
    user: { id: self.id, email: self.email, full_name: self.full_name },
    self,
    tenantId: device.tenant_id,
    appRole: null,
    isPlatform: false,
    bar,
    terminal: { device, unlocked: false },
  };
}

/** Signs a fresh pass for `userId` on the terminal of `ctx`. */
export async function issuePass(ctx: Ctx, userId: string): Promise<{ pass: string; expires_at: string }> {
  const device = ctx.terminal?.device;
  if (!device) throw new HttpError(403, 'not_terminal', 'Esta acción solo se usa desde una terminal');
  const expMs = Date.now() + PASS_TTL_MS;
  return { pass: await signPass(device.pass_key, device.id, userId, expMs), expires_at: new Date(expMs).toISOString() };
}

/**
 * Precedence: platform / bar_admin → always allowed; else an explicit
 * `PermissionProfile` override for the caller's tenant+role; else the
 * registry default (`PERMISSION_DEFAULTS`, generated from
 * `src/lib/permissionRegistry.js`); an unknown key denies.
 */
export async function hasPermission(ctx: Ctx, key: string): Promise<boolean> {
  if (ctx.isPlatform || ctx.appRole === 'bar_admin') return true;
  let overrides: Record<string, boolean> | undefined;
  if (ctx.tenantId && ctx.appRole) {
    const [profile] = await ctx.svc.entities.PermissionProfile.filter({
      tenant_id: ctx.tenantId,
      role: ctx.appRole,
    });
    overrides = profile?.overrides;
  }
  return resolvePermission(key, { isPlatform: ctx.isPlatform, appRole: ctx.appRole, overrides });
}

export async function requirePermission(ctx: Ctx, key: string): Promise<void> {
  const allowed = await hasPermission(ctx, key);
  if (!allowed) throw new HttpError(403, 'forbidden', 'No tienes permiso para esta acción');
}

/**
 * `billing_status: view_only|suspended` rejects writes with 402 `read_only`.
 * A platform caller with no `bar` loaded (e.g. `importMenu`) is never
 * blocked here — there is nothing to gate against.
 */
export function requireWritable(ctx: Ctx): void {
  const status = ctx.bar?.billing_status;
  if (isBlockedBillingStatus(status)) {
    throw new HttpError(402, 'read_only', 'El bar está en modo solo lectura o suspendido');
  }
}

/**
 * Reads a row as service role and confirms it belongs to the caller's
 * tenant — comparing against the STORED record's `tenant_id`, never a
 * tenant id taken from the request body. Missing and "belongs to another
 * tenant" both answer 404 `not_found`: telling the two apart would leak
 * which ids exist in other bars.
 */
export async function loadOwned(ctx: Ctx, entity: string, id: string): Promise<any> {
  if (!id) throw new HttpError(404, 'not_found', 'No encontrado');
  const entityClient = (ctx.svc.entities as Record<string, any>)[entity];
  if (!entityClient) throw new HttpError(500, 'internal_error', `Entidad desconocida: ${entity}`);
  const [row] = await entityClient.filter({ id });
  if (!row) throw new HttpError(404, 'not_found', 'No encontrado');
  if (!rowBelongsToTenant(row, ctx.tenantId, ctx.isPlatform)) {
    throw new HttpError(404, 'not_found', 'No encontrado');
  }
  return row;
}

export function httpError(status: number, code: string, message: string, extra?: Record<string, unknown>): never {
  throw new HttpError(status, code, message, extra);
}

export type Route = ((ctx: Ctx, body: any) => Promise<object>) & {
  allowNoTenant?: boolean;
  allowLockedTerminal?: boolean;
};

/**
 * Wraps a route that must never run from a terminal, even unlocked by an
 * admin's PIN (account deletion, handing over the bar, editing permissions,
 * managing terminals): those need the person's own sign-in with email.
 */
export function remoteOnly(route: (ctx: Ctx, body: any) => Promise<object>): Route {
  const wrapped: Route = (ctx, body) => {
    if (ctx.terminal) {
      throw new HttpError(403, 'terminal_not_allowed', 'Esto no se hace desde una terminal. Entra con tu correo en otro equipo');
    }
    return route(ctx, body);
  };
  return wrapped;
}

/**
 * Marks ONE route as runnable from a terminal that nobody has unlocked yet
 * (terminal mode: who am I, unlock with PIN). The handler must still check
 * `ctx.terminal` itself.
 */
export function allowLockedTerminal(route: (ctx: Ctx, body: any) => Promise<object>): Route {
  const wrapped: Route = (ctx, body) => route(ctx, body);
  wrapped.allowLockedTerminal = true;
  return wrapped;
}

/**
 * Marks ONE route as runnable by a platform admin who has no bar (module 14).
 * Returns a wrapper carrying the mark, so the handler itself stays untouched.
 * Use it in `entry.ts` and only for actions that are platform-only by design.
 */
export function allowNoTenant(route: (ctx: Ctx, body: any) => Promise<object>): Route {
  const wrapped: Route = (ctx, body) => route(ctx, body);
  wrapped.allowNoTenant = true;
  return wrapped;
}

/**
 * Router: parses the body, builds the context once (module 22 re-read
 * happens here, before any handler runs), dispatches on `action`, and maps
 * `HttpError` to `{ error, code }` at the right status. Each handler still
 * does its OWN `loadOwned` → `requirePermission` → `requireWritable` in that
 * order (contract §2) — `handle` only owns `requireContext` and the
 * response shape.
 */
export async function handle(req: Request, routes: Record<string, Route>): Promise<Response> {
  try {
    if (req.method !== 'POST') {
      throw new HttpError(405, 'method_not_allowed', 'Método no permitido');
    }
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      throw new HttpError(400, 'invalid_body', 'Cuerpo inválido');
    }
    const action = body?.action;
    const route =
      typeof action === 'string' && Object.prototype.hasOwnProperty.call(routes, action)
        ? routes[action]
        : undefined;
    if (!route) {
      throw new HttpError(400, 'unknown_action', 'Acción no válida');
    }
    // Module 14: no tenant means 403 `no_tenant`, except on a route that
    // opted in with `allowNoTenant(route)` (importMenu, platform-only; that
    // handler also checks ctx.isPlatform itself).
    const ctx = await requireContext(req, {
      allowNoTenant: routeAllowsNoTenant(route),
      allowLockedTerminal: routeAllowsLockedTerminal(route),
      // Terminal mode: the client sends the person's pass in the body.
      terminalPass: body?.terminal_pass,
    });
    const result = await route(ctx, body);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof HttpError) {
      // `extra` (e.g. `{ order_id }` on table_busy) is spread in, but never
      // allowed to clobber `error`/`code` themselves.
      return Response.json(
        { ...(error.extra ?? {}), error: error.message, code: error.code },
        { status: error.status }
      );
    }
    if (isRateLimitError(error)) {
      return Response.json(
        { error: 'Hay muchas solicitudes seguidas. Espera unos segundos e intenta de nuevo.', code: 'rate_limited' },
        { status: 429 }
      );
    }
    const message = error instanceof Error ? error.message : 'Error interno';
    return Response.json({ error: message, code: 'internal_error' }, { status: 500 });
  }
}

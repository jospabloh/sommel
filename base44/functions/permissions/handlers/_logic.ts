// Pure rules for the `permissions` endpoint (module 3: the admin-facing side
// of PermissionProfile). ZERO imports on purpose so `deno test` loads it
// offline; the handlers pass in what they know (the registry's keys).
// Handlers catch `LogicError` and re-throw it as `HttpError(400, ...)`.

export class LogicError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * The only role whose permissions are configurable. `bar_admin` is always
 * allowed (see `resolvePermission`), so an override stored for it would look
 * like a restriction and change nothing.
 */
export const CONFIGURABLE_ROLE = 'staff';

/** Who may read or change a bar's permission profile: its admin, or the platform. */
export function canManagePermissions(caller: {
  isPlatform: boolean;
  appRole: string | null | undefined;
}): boolean {
  return caller.isPlatform === true || caller.appRole === 'bar_admin';
}

/** `role` is optional (defaults to staff). `bar_admin` and anything else is refused. */
export function normalizeRole(input: unknown): typeof CONFIGURABLE_ROLE {
  if (input === undefined || input === null || input === CONFIGURABLE_ROLE) return CONFIGURABLE_ROLE;
  if (input === 'bar_admin') {
    throw new LogicError('invalid_role', 'El administrador siempre tiene todos los permisos');
  }
  throw new LogicError('invalid_role', 'Rol no válido');
}

/**
 * Validates the overrides map sent by the Permisos screen: a plain object,
 * every key a real registry key, every value a boolean. Returns a fresh
 * object with only those entries. Never trims silently: one bad entry
 * rejects the whole request so a typo cannot be half-applied.
 */
export function validateOverrides(input: unknown, knownKeys: Iterable<string>): Record<string, boolean> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new LogicError('invalid_body', 'overrides debe ser un objeto');
  }
  const known = new Set(knownKeys);
  const out: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!known.has(key)) {
      throw new LogicError('invalid_key', `Permiso desconocido: ${key}`);
    }
    if (typeof value !== 'boolean') {
      throw new LogicError('invalid_value', `El valor de ${key} debe ser verdadero o falso`);
    }
    out[key] = value;
  }
  return out;
}

/** What the client gets back: only the role and the override map, never row internals. */
export function profileView(
  row: { overrides?: unknown } | null | undefined,
  role: string
): { role: string; overrides: Record<string, boolean> } {
  const raw = row?.overrides;
  const overrides: Record<string, boolean> = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === 'boolean') overrides[k] = v;
    }
  }
  return { role, overrides };
}

/**
 * Per-person overrides (2026-10-06): the bar admin decides a permission for ONE
 * staff member, beating the role profile. Only a staff member of the caller's
 * own bar can carry them: a bar_admin is always allowed (an override would
 * change nothing) and a terminal is a device, not a person. Missing, another
 * bar's and a terminal answer the same 404 (no existence oracle).
 */
export function personTargetProblem(
  target: { tenant_id?: unknown; app_role?: unknown } | null | undefined,
  tenantId: string
): { status: number; code: string; message: string } | null {
  if (!target || target.tenant_id !== tenantId || target.app_role === 'terminal') {
    return { status: 404, code: 'not_found', message: 'No se encontró a esa persona en tu bar' };
  }
  if (target.app_role !== CONFIGURABLE_ROLE) {
    return { status: 400, code: 'invalid_role', message: 'El administrador siempre tiene todos los permisos' };
  }
  return null;
}

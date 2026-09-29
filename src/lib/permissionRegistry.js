// Registro de permisos granulares del bar (contrato §3, entrega-1-contratos.md).
//
// Esta es la ÚNICA fuente de verdad. `scripts/generate-guards.mjs` LEE este
// archivo y escribe una copia generada de PERMISSION_DEFAULTS dentro del
// bloque AUTOGEN de `scripts/templates/_guard_logic.ts` (Deno no puede
// importar de `src/`, así que necesita su propia copia — igual que
// StockFlow's `_permissions.ts` respecto de `permissionRegistry.js`).
// `npm run check:guards` falla si esa copia se desincroniza de este archivo.
//
// `src/lib/PermissionContext.jsx`/`usePermission.js` importan este archivo
// directamente (mismo runtime, Vite sí resuelve el import) y replican la
// MISMA precedencia que el servidor (`_guard.ts`'s `hasPermission`):
//   1. plataforma (`role: admin`) o `bar_admin` del bar → siempre permitido
//   2. override explícito en el `PermissionProfile` del bar para ese rol
//   3. default de este registro
//   4. clave desconocida → denegar

// AUTOGEN:PERMISSION_DEFAULTS:BEGIN — generado por scripts/generate-guards.mjs
// hacia scripts/templates/_guard_logic.ts. No editar la copia generada a mano.
export const PERMISSION_DEFAULTS = {
  'Menú:ver': { bar_admin: true, staff: true },
  'Menú:editar': { bar_admin: true, staff: false },
  'Menú:ver_costos': { bar_admin: true, staff: false },
  'Mesas:editar': { bar_admin: true, staff: false },
  'Comandas:tomar': { bar_admin: true, staff: true },
  'Comandas:cancelar_enviado': { bar_admin: true, staff: true },
  'Comandas:mover_mesas': { bar_admin: true, staff: true },
  'Comandas:cancelar_orden': { bar_admin: true, staff: false },
  'Estaciones:operar': { bar_admin: true, staff: true },
  'Cobro:cobrar': { bar_admin: true, staff: true },
  'Cobro:descuento': { bar_admin: true, staff: false },
  'Cobro:anular_pago': { bar_admin: true, staff: false },
  'Turno:operar': { bar_admin: true, staff: true },
  'Turno:ver_corte': { bar_admin: true, staff: false },
  'Inventario:ver': { bar_admin: true, staff: true },
  'Inventario:merma': { bar_admin: true, staff: true },
  'Inventario:editar': { bar_admin: true, staff: false },
  'Impresion:operar': { bar_admin: true, staff: true },
  'Reportes:ver': { bar_admin: true, staff: false },
  'Ajustes:editar': { bar_admin: true, staff: false },
  'Asistencia:checar': { bar_admin: true, staff: true },
  'Asistencia:ver_equipo': { bar_admin: true, staff: false },
  'Asistencia:corregir': { bar_admin: true, staff: false },
};
// AUTOGEN:PERMISSION_DEFAULTS:END

/**
 * Misma precedencia que `_guard.ts`'s `hasPermission` en el servidor.
 * @param {string} key - Clave 'Sección:accion'.
 * @param {{ isPlatform?: boolean, appRole?: 'bar_admin'|'staff'|null, overrides?: Record<string, boolean>|null }} ctx
 * @returns {boolean}
 */
export function resolvePermission(key, ctx) {
  const { isPlatform, appRole, overrides } = ctx || {};
  if (isPlatform || appRole === 'bar_admin') return true;
  const o = overrides || {};
  if (Object.prototype.hasOwnProperty.call(o, key)) return !!o[key];
  const def = PERMISSION_DEFAULTS[key];
  if (!def) return false; // clave desconocida => deniega
  if (appRole === 'staff') return !!def.staff;
  return false; // sin app_role => deniega
}

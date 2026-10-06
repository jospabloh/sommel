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
  'Estaciones:cocina': { bar_admin: true, staff: true },
  'Estaciones:barra': { bar_admin: true, staff: true },
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
  'Ajustes:exportar': { bar_admin: true, staff: false },
  'Equipo:invitar': { bar_admin: true, staff: false },
  'Equipo:cambiar_rol': { bar_admin: true, staff: false },
  'Equipo:quitar': { bar_admin: true, staff: false },
  'Asistencia:checar': { bar_admin: true, staff: true },
  'Asistencia:ver_equipo': { bar_admin: true, staff: false },
  'Asistencia:corregir': { bar_admin: true, staff: false },
  'Seguridad:ver': { bar_admin: true, staff: false },
};
// AUTOGEN:PERMISSION_DEFAULTS:END

/**
 * Etiquetas en español de cada clave, para la pantalla de Permisos (módulo 3).
 * Vive FUERA del bloque AUTOGEN: el servidor solo necesita los defaults, y
 * `base44/tests/permissions_logic_test.ts` falla si una clave de arriba se
 * queda sin etiqueta (o si aquí sobra una que ya no existe).
 * Cada valor es { section, label }: `section` agrupa filas en la matriz.
 */
export const PERMISSION_LABELS = {
  'Menú:ver': { section: 'Menú', label: 'Ver el menú' },
  'Menú:editar': { section: 'Menú', label: 'Editar categorías y productos' },
  'Menú:ver_costos': { section: 'Menú', label: 'Ver costos de los productos' },
  'Mesas:editar': { section: 'Mesas', label: 'Crear, editar y borrar mesas' },
  'Comandas:tomar': { section: 'Comandas', label: 'Tomar y enviar comandas' },
  'Comandas:cancelar_enviado': { section: 'Comandas', label: 'Cancelar productos ya enviados' },
  'Comandas:mover_mesas': { section: 'Comandas', label: 'Mover y unir mesas' },
  'Comandas:cancelar_orden': { section: 'Comandas', label: 'Cancelar una orden completa' },
  'Estaciones:cocina': { section: 'Estaciones', label: 'Atender cocina' },
  'Estaciones:barra': { section: 'Estaciones', label: 'Atender barra' },
  'Cobro:cobrar': { section: 'Cobro', label: 'Cobrar cuentas' },
  'Cobro:descuento': { section: 'Cobro', label: 'Aplicar descuentos' },
  'Cobro:anular_pago': { section: 'Cobro', label: 'Anular pagos' },
  'Turno:operar': { section: 'Turno', label: 'Abrir turno y registrar salidas de caja' },
  'Turno:ver_corte': { section: 'Turno', label: 'Ver y cerrar el corte de caja' },
  'Inventario:ver': { section: 'Inventario', label: 'Ver el inventario' },
  'Inventario:merma': { section: 'Inventario', label: 'Registrar mermas' },
  'Inventario:editar': { section: 'Inventario', label: 'Editar insumos, entradas y conteos' },
  'Impresion:operar': { section: 'Impresión', label: 'Operar la cola de impresión' },
  'Reportes:ver': { section: 'Reportes', label: 'Ver reportes' },
  'Ajustes:editar': { section: 'Ajustes', label: 'Editar los ajustes del bar' },
  'Ajustes:exportar': { section: 'Ajustes', label: 'Exportar los datos del bar' },
  'Asistencia:checar': { section: 'Asistencia', label: 'Checar entrada y salida' },
  'Asistencia:ver_equipo': { section: 'Asistencia', label: 'Ver la asistencia del equipo' },
  'Asistencia:corregir': { section: 'Asistencia', label: 'Corregir marcas de asistencia' },
  'Seguridad:ver': { section: 'Seguridad', label: 'Ver fotos y alertas de préstamo de PIN' },
  'Equipo:invitar': { section: 'Equipo', label: 'Invitar personas al equipo' },
  'Equipo:cambiar_rol': { section: 'Equipo', label: 'Cambiar el rol de una persona' },
  'Equipo:quitar': { section: 'Equipo', label: 'Quitar personas del equipo' },
};

/** Etiqueta legible de una clave; cae a la propia clave si no la conoce. */
export function permissionLabel(key) {
  return PERMISSION_LABELS[key]?.label ?? key;
}

/**
 * Claves que reemplazaron a otra: un perfil o una persona guardados con la
 * clave vieja siguen valiendo para las nuevas (2026-10-06: `Estaciones:operar`
 * se partió en cocina y barra). Mismo mapa en `_guard_logic.ts`.
 */
export const LEGACY_PERMISSION_ALIASES = {
  'Estaciones:cocina': 'Estaciones:operar',
  'Estaciones:barra': 'Estaciones:operar',
};

/**
 * Copia de un mapa de overrides con las claves viejas traducidas a las nuevas
 * (sin pisar una nueva que ya exista). La pantalla de Permisos guarda el mapa
 * completo con solo claves vigentes: sin esto, un `Estaciones:operar: false`
 * guardado antes se perdería en silencio al siguiente guardado y el personal
 * recuperaría las estaciones.
 */
export function upgradeLegacyKeys(map) {
  const out = { ...(map || {}) };
  for (const [key, legacy] of Object.entries(LEGACY_PERMISSION_ALIASES)) {
    if (!Object.prototype.hasOwnProperty.call(out, key) && Object.prototype.hasOwnProperty.call(out, legacy)) {
      out[key] = out[legacy];
    }
  }
  for (const legacy of new Set(Object.values(LEGACY_PERMISSION_ALIASES))) delete out[legacy];
  return out;
}

function overrideFor(map, key) {
  if (!map || typeof map !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(map, key)) return !!map[key];
  const legacy = LEGACY_PERMISSION_ALIASES[key];
  if (legacy && Object.prototype.hasOwnProperty.call(map, legacy)) return !!map[legacy];
  return undefined;
}

/**
 * Misma precedencia que el servidor (`resolvePermission` en `_guard_logic.ts`):
 * plataforma o bar_admin, siempre; si no, lo que el admin decidió para ESTA
 * persona; si no, el perfil del rol; si no, el default del registro.
 */
export function resolvePermission(key, ctx) {
  const { isPlatform, appRole, overrides, personOverrides } = ctx || {};
  if (isPlatform || appRole === 'bar_admin') return true;
  const person = overrideFor(personOverrides, key);
  if (person !== undefined) return person;
  const role = overrideFor(overrides, key);
  if (role !== undefined) return role;
  const def = PERMISSION_DEFAULTS[key];
  if (!def) return false; // clave desconocida => deniega
  if (appRole === 'staff') return !!def.staff;
  return false; // sin app_role => deniega
}

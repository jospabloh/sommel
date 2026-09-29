// Pure rules for the Permisos screen (module 3). No React, no imports beyond
// the registry, so a Deno test can load it. The server (`permissions`
// endpoint) is the authority; this only shapes what the screen shows and what
// it sends. `upsertProfile` REPLACES the whole override map, so every save
// sends the full map built here.
import { PERMISSION_DEFAULTS, PERMISSION_LABELS } from '../../lib/permissionRegistry.js';

/** Default for the configurable role (staff) of a key. */
export function defaultFor(key) {
  return PERMISSION_DEFAULTS[key]?.staff === true;
}

/** Value in force for staff: explicit override, else the registry default. */
export function effectiveFor(key, overrides) {
  const o = overrides || {};
  return Object.prototype.hasOwnProperty.call(o, key) ? o[key] === true : defaultFor(key);
}

/** True when the key has an override that differs from the default. */
export function isChanged(key, overrides) {
  const o = overrides || {};
  return Object.prototype.hasOwnProperty.call(o, key) && (o[key] === true) !== defaultFor(key);
}

/**
 * Keeps only real registry keys with boolean values that differ from the
 * default. An override equal to the default says nothing, and unknown keys
 * would make the server reject the whole request.
 */
export function cleanOverrides(raw) {
  const out = {};
  for (const [k, v] of Object.entries(raw || {})) {
    if (!Object.prototype.hasOwnProperty.call(PERMISSION_DEFAULTS, k)) continue;
    if (typeof v !== 'boolean') continue;
    if (v === defaultFor(k)) continue;
    out[k] = v;
  }
  return out;
}

/** Next map after setting `key` to `value` (a value equal to the default drops the entry). */
export function withValue(overrides, key, value) {
  const next = { ...(overrides || {}) };
  if (value === defaultFor(key)) delete next[key];
  else next[key] = value;
  return cleanOverrides(next);
}

/** Next map after resetting `key` to its default. */
export function withoutKey(overrides, key) {
  const next = { ...(overrides || {}) };
  delete next[key];
  return cleanOverrides(next);
}

/**
 * Registry keys no server route consults yet: manageStaff gates every team
 * action on app_role === 'bar_admin' whatever the overrides say. Showing a
 * switch for them would say "Cambiado" for something that changes nothing, so
 * the screen hides them. Remove a key from here in the same change that makes a
 * handler call requirePermission/hasPermission with it.
 */
export const NOT_ENFORCED_KEYS = ['Equipo:invitar', 'Equipo:cambiar_rol', 'Equipo:quitar'];

/** Groups keys by section, in the order the registry lists them. */
export function groupSections() {
  const order = [];
  const bySection = new Map();
  for (const key of Object.keys(PERMISSION_DEFAULTS)) {
    if (NOT_ENFORCED_KEYS.includes(key)) continue;
    const meta = PERMISSION_LABELS[key];
    const section = meta?.section ?? 'Otros';
    if (!bySection.has(section)) {
      bySection.set(section, []);
      order.push(section);
    }
    bySection.get(section).push({ key, label: meta?.label ?? key });
  }
  return order.map((section) => ({ section, items: bySection.get(section) }));
}

/** How many keys of the map are changed from their default. */
export function changedCount(overrides) {
  return Object.keys(cleanOverrides(overrides)).length;
}

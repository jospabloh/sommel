// Pure rules for the Permisos screen (module 3). No React, no imports beyond
// the registry, so a Deno test can load it. The server (`permissions`
// endpoint) is the authority; this only shapes what the screen shows and what
// it sends. `upsertProfile` REPLACES the whole override map, so every save
// sends the full map built here.
import { PERMISSION_DEFAULTS, PERMISSION_LABELS, upgradeLegacyKeys } from '../../lib/permissionRegistry.js';

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
  // Old keys become their replacements first (Estaciones:operar → cocina, barra).
  for (const [k, v] of Object.entries(upgradeLegacyKeys(raw))) {
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

// ---- Per-person overrides (2026-10-06): Staff → "Permisos de esta persona".
// Unlike the role map, an explicit choice equal to what the role says is KEPT:
// "Sí para Ana" must survive the admin later turning the key off for the role.

/** Known keys with boolean values, old keys translated; nothing else. */
export function cleanPersonOverrides(raw) {
  const out = {};
  for (const [k, v] of Object.entries(upgradeLegacyKeys(raw))) {
    if (!Object.prototype.hasOwnProperty.call(PERMISSION_DEFAULTS, k)) continue;
    if (typeof v !== 'boolean') continue;
    out[k] = v;
  }
  return out;
}

/** 'role' (follows the role), 'yes' or 'no' for one key of a person. */
export function personChoice(key, personMap) {
  const m = personMap || {};
  if (!Object.prototype.hasOwnProperty.call(m, key)) return 'role';
  return m[key] === true ? 'yes' : 'no';
}

/** Next person map after choosing 'role' | 'yes' | 'no' for `key`. */
export function withPersonChoice(personMap, key, choice) {
  const next = { ...(personMap || {}) };
  if (choice === 'yes') next[key] = true;
  else if (choice === 'no') next[key] = false;
  else delete next[key];
  return cleanPersonOverrides(next);
}

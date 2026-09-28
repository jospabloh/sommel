/**
 * Shared validation for Base44 entity RLS rules. Used by the Node CLI
 * (scripts/validate-entity-rls.mjs). Adapted from StockFlow's copy of the same
 * file — this app's tenant field is `tenant_id`, not `business_id` (see
 * docs/plan-tecnico.md D1: `WineBar` is the tenant, pointer is
 * `User.data.tenant_id`).
 *
 * Background — the "cero items" outage (2026-06-16, StockFlow): every entity↔
 * user RLS comparison has two halves, and getting either wrong fails silently:
 *
 *   - ENTITY side: custom fields live under `data.` in Base44. A rule key must
 *     be a built-in (id, created_by_id, created_date, updated_date) or start
 *     with `data.`. A bare `tenant_id` references a non-existent field → the
 *     rule never matches → RLS effectively OFF (cross-tenant leak).
 *
 *   - USER side: custom user fields resolve as `{{user.data.<field>}}`. The
 *     only bare built-ins are `{{user.id}}`, `{{user.email}}`, `{{user.role}}`.
 *     `{{user.tenant_id}}` resolves to nothing → the rule matches nothing →
 *     ZERO rows for everyone.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const BUILTIN_ENTITY_FIELDS = new Set([
  "id",
  "created_by_id",
  "created_by",
  "created_date",
  "updated_date",
]);
const BUILTIN_USER_VARS = new Set(["id", "email", "role"]);

// Entities that carry a `tenant_id` field but are legitimately scoped by a
// DIFFERENT field for read — the heuristic below (any entity with tenant_id
// must filter read by data.tenant_id) would otherwise flag them as broken
// tenant isolation when they aren't. Empty today: Sommel has no per-user
// (non-tenant) scoped entity besides AppSession, which has no tenant_id field
// at all and so never enters this check.
const USER_SCOPED_READ_ALLOWLIST = new Set([]);
const LOGICAL_OPERATORS = new Set(["$or", "$and", "$nor", "$not"]);

/** Strip // and block comments so JSONC parses as JSON. */
export function parseJsonc(text) {
  const noBlock = text.replace(/\/\*[\s\S]*?\*\//g, "");
  const noLine = noBlock.replace(/(^|[^:])\/\/.*$/gm, "$1");
  return JSON.parse(noLine);
}

function checkUserTemplates(value, entity, opLabel, errors) {
  const json = JSON.stringify(value);
  const re = /\{\{\s*user\.([a-zA-Z0-9_.]+)\s*\}\}/g;
  let m;
  while ((m = re.exec(json)) !== null) {
    const path = m[1];
    if (path.startsWith("data.")) continue;
    if (BUILTIN_USER_VARS.has(path)) continue;
    errors.push(
      `${entity} [${opLabel}]: user template "{{user.${path}}}" is invalid. ` +
        `Custom user fields must be "{{user.data.${path}}}" ` +
        `(only id/email/role are bare built-ins).`,
    );
  }
}

function checkEntityKeys(rule, entity, opLabel, errors) {
  if (rule === null || typeof rule !== "object" || Array.isArray(rule)) return;
  for (const key of Object.keys(rule)) {
    if (key === "user_condition") continue;
    if (LOGICAL_OPERATORS.has(key)) {
      const branches = Array.isArray(rule[key]) ? rule[key] : [rule[key]];
      branches.forEach((b) => checkEntityKeys(b, entity, opLabel, errors));
      continue;
    }
    if (key.startsWith("$")) continue;
    if (key.startsWith("data.")) continue;
    if (BUILTIN_ENTITY_FIELDS.has(key)) continue;
    errors.push(
      `${entity} [${opLabel}]: rule key "${key}" must use the "data." prefix ` +
        `(custom entity fields live under data.; bare "${key}" matches nothing ` +
        `→ RLS effectively disabled).`,
    );
  }
}

/**
 * Scan an entities directory and return { errors, total, businessScoped }.
 * (Keeping the `businessScoped` name for parity with the CLI/Deno callers
 * that print it — here it counts tenant_id-scoped entities.)
 * errors is an array of human-readable strings; empty means valid.
 */
export function collectRlsErrors(entitiesDir) {
  const errors = [];
  const files = readdirSync(entitiesDir).filter((f) => f.endsWith(".jsonc"));
  let businessScoped = 0;

  for (const file of files) {
    const entity = file.replace(/\.jsonc$/, "");
    let schema;
    try {
      schema = parseJsonc(readFileSync(join(entitiesDir, file), "utf8"));
    } catch (e) {
      errors.push(`${entity}: failed to parse JSONC — ${e.message}`);
      continue;
    }
    const rls = schema.rls;
    if (!rls) continue;

    for (const op of ["create", "read", "update", "delete"]) {
      if (!(op in rls)) continue;
      checkUserTemplates(rls[op], entity, op, errors);
      checkEntityKeys(rls[op], entity, op, errors);
    }

    // Tenant-scoped entities (have tenant_id) must filter read by
    // data.tenant_id == {{user.data.tenant_id}}. Platform-admin entities that
    // gate read behind role:admin alone are exempt — they are not per-tenant
    // readable.
    const hasTenantId = schema.properties &&
      "tenant_id" in schema.properties;
    const adminGated = rls.read &&
      JSON.stringify(rls.read) === '{"user_condition":{"role":"admin"}}';
    if (hasTenantId && rls.read && !adminGated) {
      businessScoped++;
      const readJson = JSON.stringify(rls.read);
      const adminBranch = '"user_condition":{"role":"admin"}';
      if (
        !readJson.includes('"data.tenant_id":"{{user.data.tenant_id}}"') &&
        !USER_SCOPED_READ_ALLOWLIST.has(entity)
      ) {
        errors.push(
          `${entity} [read]: tenant-scoped entity (has tenant_id) must ` +
            `filter read by {"data.tenant_id":"{{user.data.tenant_id}}"}.`,
        );
      }

      // READ side: the tenant equality above keeps end users isolated (a
      // staff user never matches the admin branch), but the read rule must
      // ALSO carry the service-role branch. Safe functions load a record via
      // base44.asServiceRole BEFORE acting on it, and asServiceRole evaluates
      // as role:admin with NO end-user context — so a read rule of only
      // {"data.tenant_id":"{{user.data.tenant_id}}"} resolves the user
      // template to empty and asServiceRole.filter() returns ZERO rows. The
      // function then sees "not found" and fails silently. Same OR-branch as
      // writes.
      if (!readJson.includes(adminBranch)) {
        errors.push(
          `${entity} [read]: tenant-scoped read rule must include the ` +
            `service-role branch {"user_condition":{"role":"admin"}} (e.g. ` +
            `{"$or":[{"data.tenant_id":"{{user.data.tenant_id}}"},` +
            `{"user_condition":{"role":"admin"}}]}). Backend reads go through ` +
            `base44.asServiceRole (role:admin, no end-user context); without ` +
            `this branch asServiceRole.filter() returns empty and Safe ` +
            `functions that read-then-write fail silently. End users stay ` +
            `isolated via the tenant equality — staff never matches ` +
            `role:admin.`,
        );
      }

      // WRITE side: create/update/delete must allow the service role. Every
      // write in this app (D4) goes through a Safe function via
      // base44.asServiceRole, which evaluates as role:admin and has NO
      // end-user context — so a write rule of only
      // {"data.tenant_id":"{{user.data.tenant_id}}"} resolves the user
      // template to empty and rejects the write. The fix is the same
      // OR-branch: {"user_condition":{"role":"admin"}}.
      for (const op of ["create", "update", "delete"]) {
        if (!(op in rls)) {
          errors.push(
            `${entity} [${op}]: tenant-scoped entity must define a ${op} rule.`,
          );
          continue;
        }
        if (!JSON.stringify(rls[op]).includes(adminBranch)) {
          errors.push(
            `${entity} [${op}]: tenant-scoped write rule must include ` +
              `{"user_condition":{"role":"admin"}} (e.g. {"$or":[` +
              `{"data.tenant_id":"{{user.data.tenant_id}}"},` +
              `{"user_condition":{"role":"admin"}}]}). Backend writes go ` +
              `through base44.asServiceRole (role:admin, no end-user context); ` +
              `without this branch the user template resolves to empty and ` +
              `EVERY write via a Safe function fails silently.`,
          );
        }
      }
    }
  }

  return { errors, total: files.length, businessScoped };
}

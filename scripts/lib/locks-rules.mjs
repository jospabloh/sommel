/**
 * Module 19 (STANDARD.md): a shipped security lock needs a guard of its own.
 *
 * MANIFEST is the explicit list of every lock this app relies on. A lock that
 * is loosened, or whose rationale text is deleted, fails validation. A NEW lock
 * must be added here deliberately; that is the point.
 *
 * Shared by the Node CLI (scripts/validate-locks.mjs) and the Deno test
 * (base44/tests/locks_test.ts). It does not change or interpret RLS semantics,
 * it only asserts that specific rules and their descriptions are still present.
 *
 * Description rule: each lock carries its rationale in a field description that
 * is actually deployed (comments in .jsonc never reach the live schema). The
 * description must name "Módulo 19", the operation the lock governs, and what
 * breaks if it is removed ("Si se ..."), and be long enough to say it.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** Strip // and block comments so JSONC parses as JSON (same as validate-rls). */
export function parseJsonc(text) {
  const noBlock = text.replace(/\/\*[\s\S]*?\*\//g, "");
  const noLine = noBlock.replace(/(^|[^:])\/\/.*$/gm, "$1");
  return JSON.parse(noLine);
}

export const ADMIN_ONLY = { user_condition: { role: "admin" } };
const MIN_DESC = 200;

// Field-level locks. `rule` is the exact expected rls.<op> value.
export const FIELD_LOCKS = [
  { entity: "User", field: "tenant_id", op: "write", rule: false, words: ["escritura"], module: "Módulo 24" },
  { entity: "User", field: "app_role", op: "write", rule: false, words: ["escritura"], module: "Módulo 24" },
  { entity: "User", field: "display_name", op: "write", rule: false, words: ["escritura"] },
  { entity: "User", field: "photo_check", op: "write", rule: false, words: ["escritura"] },
  { entity: "User", field: "permission_overrides", op: "write", rule: false, words: ["escritura"] },
  ...["billing_status", "trial_end_at", "current_period_end", "plan", "owner_id", "archived_at", "license_audit"].map((field) => ({
    entity: "WineBar", field, op: "write", rule: ADMIN_ONLY, words: ["escritura"],
  })),
  ...["OrderItem", "InventoryItem", "InventoryMovement"].map((entity) => ({
    entity, field: "unit_cost", op: "read", rule: ADMIN_ONLY, words: ["lectura"],
  })),
];

// Entity-level locks. `ops` must equal ADMIN_ONLY. `carrier` is the field whose
// description carries the rationale (a top-level entity description is not
// known to be accepted by Base44, so a stable field carries it). `words: null`
// means no description is required (rule-only lock).
const WRITE_OPS = ["create", "update", "delete"];
export const ENTITY_LOCKS = [
  { entity: "Product", ops: ["read", ...WRITE_OPS], carrier: "tenant_id", words: ["lectura", "escritura"] },
  { entity: "Attendance", ops: ["read", ...WRITE_OPS], carrier: "tenant_id", words: ["lectura", "escritura"] },
  { entity: "StaffPin", ops: ["read", ...WRITE_OPS], carrier: "tenant_id", words: ["lectura", "escritura"] },
  { entity: "TerminalDevice", ops: ["read", ...WRITE_OPS], carrier: "tenant_id", words: ["lectura", "escritura"] },
  { entity: "PhotoCheck", ops: ["read", ...WRITE_OPS], carrier: "tenant_id", words: ["lectura", "escritura"] },
  { entity: "SecurityAlert", ops: ["read", ...WRITE_OPS], carrier: "tenant_id", words: ["lectura", "escritura"] },
  { entity: "ApprovalLog", ops: ["read", ...WRITE_OPS], carrier: "tenant_id", words: ["lectura", "escritura"] },
  { entity: "Passkey", ops: ["read", ...WRITE_OPS], carrier: "tenant_id", words: ["lectura", "escritura"] },
  { entity: "ApprovalRequest", ops: ["read", ...WRITE_OPS], carrier: "tenant_id", words: ["lectura", "escritura"] },
  ...["Order", "Payment", "Shift", "CashMovement", "StaffInvite", "PermissionProfile"].map((entity) => ({
    entity, ops: WRITE_OPS, carrier: "tenant_id", words: ["escritura"],
  })),
  ...["OrderItem", "InventoryItem", "InventoryMovement"].map((entity) => ({
    entity, ops: WRITE_OPS, carrier: null, words: null,
  })),
  { entity: "WineBar", ops: ["create", "delete"], carrier: null, words: null },
];

/** Load every entity schema in a directory into { [name]: schema }. */
export function loadSchemas(dir) {
  const out = {};
  for (const f of readdirSync(dir)) {
    if (!/\.jsonc?$/.test(f)) continue;
    const s = parseJsonc(readFileSync(join(dir, f), "utf8"));
    out[s.name] = s;
  }
  return out;
}

function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function checkDescription(label, desc, words, module, errors) {
  if (typeof desc !== "string" || desc.length < MIN_DESC) {
    errors.push(`${label}: description missing or shorter than ${MIN_DESC} chars; a lock must carry its rationale in a deployed description.`);
    return;
  }
  const low = desc.toLowerCase();
  const need = [module ?? "Módulo 19", ...(words ?? [])];
  for (const w of need) {
    if (!low.includes(w.toLowerCase())) errors.push(`${label}: description must mention "${w}".`);
  }
  if (!low.includes("si se ")) {
    errors.push(`${label}: description must say what breaks if the lock is removed (a sentence starting "Si se ...").`);
  }
}

/** Returns { errors, checked } for a { name: schema } map. */
export function collectLockErrors(schemas) {
  const errors = [];
  let checked = 0;
  for (const l of FIELD_LOCKS) {
    const label = `${l.entity}.${l.field} [${l.op}]`;
    const prop = schemas[l.entity]?.properties?.[l.field];
    checked++;
    if (!prop) {
      errors.push(`${label}: field not found.`);
      continue;
    }
    if (!prop.rls || !("write" in prop.rls || "read" in prop.rls) || !same(prop.rls[l.op], l.rule)) {
      errors.push(`${label}: lock missing or changed (expected ${JSON.stringify(l.rule)}, found ${JSON.stringify(prop.rls?.[l.op])}).`);
    }
    checkDescription(label, prop.description, l.words, l.module, errors);
  }
  for (const l of ENTITY_LOCKS) {
    const s = schemas[l.entity];
    checked++;
    if (!s) {
      errors.push(`${l.entity}: entity not found.`);
      continue;
    }
    for (const op of l.ops) {
      if (!same(s.rls?.[op], ADMIN_ONLY)) {
        errors.push(`${l.entity} [${op}]: entity lock missing or loosened (expected ${JSON.stringify(ADMIN_ONLY)}, found ${JSON.stringify(s.rls?.[op])}).`);
      }
    }
    if (l.carrier) {
      checkDescription(`${l.entity}.${l.carrier} (entity lock rationale)`, s.properties?.[l.carrier]?.description, l.words, null, errors);
    }
  }
  return { errors, checked };
}

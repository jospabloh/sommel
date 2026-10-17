#!/usr/bin/env node
/**
 * Base44 is still production while Sommel moves to Supabase, so fields keep
 * landing in base44/entities/*.jsonc. This check fails when an entity or a
 * field has no column in supabase/migrations/*.sql (2026-10-16: three fields
 * added on 2026-10-15 were missing from the Supabase schema).
 *
 *   npm run check:supabase-schema
 *
 * Direction is entity -> table only: the tables carry columns Base44 adds on
 * its own (id, created_date, ...) and the split cost tables.
 */

import process from "node:process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readMigrationColumns } from "./lib/supabase-migrations.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENTITIES_DIR = join(root, "base44", "entities");
const MIGRATIONS_DIR = join(root, "supabase", "migrations");

// Names that are not plain snake_case of the entity (supabase/README.md).
const TABLE_OF = { Order: "orders", User: "profile", WineBar: "wine_bar" };

// Fields that live somewhere else on purpose: entity -> field -> "table.column".
const MOVED = {
  OrderItem: { unit_cost: "order_item_cost.unit_cost" },
  InventoryItem: { unit_cost: "inventory_item_cost.unit_cost" },
  InventoryMovement: { unit_cost: "inventory_movement_cost.unit_cost" },
  // Base44's built-in platform role; here it is profile.is_platform.
  User: { role: "profile.is_platform" },
};

const snake = (s) => s.replace(/[A-Z]/g, (c, i) => (i ? "_" : "") + c.toLowerCase());

function stripJsonc(text) {
  // Drop // and /* */ comments outside strings.
  let out = "";
  let inStr = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      out += c;
      if (c === "\\") out += text[++i] ?? "";
      else if (c === '"') inStr = false;
    } else if (c === '"') {
      inStr = true;
      out += c;
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (c === "/" && text[i + 1] === "*") {
      i = text.indexOf("*/", i + 2) + 1;
    } else out += c;
  }
  return out;
}

const cols = readMigrationColumns(MIGRATIONS_DIR);
const has = (ref) => {
  const [t, c] = ref.split(".");
  return cols.get(t)?.has(c) ?? false;
};

const errors = [];
let entities = 0;
let fields = 0;
for (const file of readdirSync(ENTITIES_DIR).filter((f) => /\.jsonc?$/.test(f)).sort()) {
  const entity = file.replace(/\.jsonc?$/, "");
  const schema = JSON.parse(stripJsonc(readFileSync(join(ENTITIES_DIR, file), "utf8")));
  const table = TABLE_OF[entity] ?? snake(entity);
  entities++;
  if (!cols.has(table)) {
    errors.push(`${entity}: no table public.${table} in supabase/migrations`);
    continue;
  }
  for (const field of Object.keys(schema.properties ?? {})) {
    fields++;
    const ref = MOVED[entity]?.[field] ?? `${table}.${field}`;
    if (!has(ref)) errors.push(`${entity}.${field}: no column ${ref} in supabase/migrations`);
  }
}
for (const [entity, moved] of Object.entries(MOVED)) {
  for (const ref of Object.values(moved)) {
    if (!has(ref)) errors.push(`${entity}: MOVED points to ${ref}, which does not exist`);
  }
}

if (errors.length > 0) {
  console.error(`\n✗ Supabase schema drift (${errors.length}):\n`);
  for (const e of errors) console.error(`  - ${e}`);
  console.error("\nAdd a migration in supabase/migrations (and to the supabase-isolation job in ci.yml).\n");
  process.exit(1);
}
console.log(`✓ Supabase schema matches base44/entities (${entities} entities, ${fields} fields).`);

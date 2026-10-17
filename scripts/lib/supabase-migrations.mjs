// Reads supabase/migrations/*.sql (in file-name order) and returns the columns
// of every public table with its SQL type. Shared by check-supabase-schema.mjs
// (entity -> column parity) and generate-supabase-schema.mjs (the column types
// the Edge Functions' `entities` shim uses to normalise writes).
//
// It understands the subset of DDL our migrations use: `create table` with one
// column per line, `alter table ... add column / drop column / rename column /
// rename to` and `drop table`. A migration that needs more (type changes) must
// extend this parser on purpose.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const KEYWORDS = new Set(["unique", "primary", "foreign", "constraint", "check", "exclude"]);

// Collapses a column definition to the base type the shim cares about.
function baseType(def) {
  const d = def.toLowerCase();
  if (/^(uuid)\[\]/.test(d)) return "uuid[]";
  if (/^text\[\]/.test(d)) return "text[]";
  for (const t of ["uuid", "timestamptz", "integer", "bigint", "numeric", "boolean", "jsonb", "text", "date"]) {
    if (d.startsWith(t)) return t;
  }
  if (d.startsWith("timestamp")) return "timestamptz";
  return d.split(/\s+/)[0];
}

export function readMigrationColumns(migrationsDir) {
  const sql = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(migrationsDir, f), "utf8"))
    .join("\n")
    .replace(/--[^\n]*/g, "");
  const tables = new Map();
  const set = (t, c, type) => {
    if (!tables.has(t)) tables.set(t, new Map());
    tables.get(t).set(c, type);
  };
  for (const m of sql.matchAll(/create table (?:if not exists )?(?:public\.)?(\w+)\s*\(([\s\S]*?)\n\);/gi)) {
    const table = m[1].toLowerCase();
    if (!tables.has(table)) tables.set(table, new Map());
    for (const line of m[2].split("\n")) {
      const w = line.match(/^\s*([a-z_][a-z0-9_]*)\s+(\S.*)$/i);
      if (w && !KEYWORDS.has(w[1].toLowerCase())) set(table, w[1].toLowerCase(), baseType(w[2]));
    }
  }
  for (const m of sql.matchAll(/alter table (?:only )?(?:public\.)?(\w+)\s+([\s\S]*?);/gi)) {
    const table = m[1].toLowerCase();
    for (const a of m[2].matchAll(/add column (?:if not exists )?(\w+)\s+([^,;]+)/gi)) set(table, a[1].toLowerCase(), baseType(a[2].trim()));
    for (const d of m[2].matchAll(/drop column (?:if exists )?(\w+)/gi)) tables.get(table)?.delete(d[1].toLowerCase());
    for (const r of m[2].matchAll(/rename column (\w+) to (\w+)/gi)) {
      const cols = tables.get(table);
      const type = cols?.get(r[1].toLowerCase());
      if (type !== undefined) {
        cols.delete(r[1].toLowerCase());
        cols.set(r[2].toLowerCase(), type);
      }
    }
    const renamed = m[2].match(/^rename to (\w+)/i);
    if (renamed && tables.has(table)) {
      tables.set(renamed[1].toLowerCase(), tables.get(table));
      tables.delete(table);
    }
  }
  for (const m of sql.matchAll(/drop table (?:if exists )?(?:public\.)?(\w+)/gi)) tables.delete(m[1].toLowerCase());
  return tables;
}

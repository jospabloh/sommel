#!/usr/bin/env node
/**
 * Module 22 guard: a backend function may use `auth.me()` for IDENTITY only
 * (`id`, `email`, `full_name`). Its `.data`, `.role`, `.app_role`, `.tenant_id`
 * are a cached view that can be stale, so no decision may be made from them;
 * the server-authoritative values come from a fresh `asServiceRole` read
 * (`ctx.self` in the guards).
 *
 *   npm run check:auth-me
 *
 * Heuristic, comment-aware: for every variable bound from `auth.me()` (plus
 * `ctx.user`), any property access other than the identity allowlist fails.
 * Tests are skipped. It cannot see an alias made through destructuring; the
 * pattern `const { data } = await ...auth.me()` is flagged separately.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCAN = ["base44/functions", "scripts/templates"];
const IDENTITY = new Set(["id", "email", "full_name"]);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(ts|js|mjs)$/.test(name) && !/\.test\.[a-z]+$/.test(name)) yield p;
  }
}

// Blank out comments and string contents but keep line numbers intact.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, pre) => pre + " ".repeat(m.length - pre.length));
}

export function findViolations(source) {
  const code = stripComments(source);
  const out = [];
  const names = new Set(["ctx.user"]);
  for (const m of code.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*await\s+[\w$.]*auth\.me\s*\(/g)) {
    names.add(m[1]);
  }
  for (const m of code.matchAll(/(?:const|let|var)\s*\{[^}]*\}\s*=\s*await\s+[\w$.]*auth\.me\s*\(/g)) {
    out.push({ index: m.index, msg: "destructures auth.me(); read identity fields by name from the result" });
  }
  for (const name of names) {
    const esc = name.replace(/[.$]/g, "\\$&");
    const re = new RegExp(`(?<![\\w$.])${esc}\\s*\\??\\.\\s*([A-Za-z_$][\\w$]*)`, "g");
    for (const m of code.matchAll(re)) {
      if (!IDENTITY.has(m[1])) {
        out.push({ index: m.index, msg: `${name}.${m[1]} read from auth.me() (identity fields only: id, email, full_name)` });
      }
    }
  }
  return out.map((v) => ({ line: code.slice(0, v.index).split("\n").length, msg: v.msg }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = [];
  let files = 0;
  for (const base of SCAN) {
    for (const file of walk(join(root, base))) {
      files++;
      for (const v of findViolations(readFileSync(file, "utf8"))) {
        problems.push(`${relative(root, file)}:${v.line}  ${v.msg}`);
      }
    }
  }
  if (problems.length) {
    console.error(`\n✗ check:auth-me found ${problems.length} problem(s):\n`);
    for (const p of problems) console.error(`  - ${p}`);
    console.error("\nRe-read the User row with asServiceRole and decide from that. See STANDARD.md module 22.\n");
    process.exit(1);
  }
  console.log(`✓ check:auth-me — ${files} file(s) scanned, auth.me() used for identity only.`);
}

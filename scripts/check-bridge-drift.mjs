#!/usr/bin/env node
/**
 * Module 15 guard: every `_acaciaSign.ts` under base44/functions must be
 * byte-identical to the portfolio's canonical helper
 * (acacia-app-standard `shared/bridge/acaciaSign.ts`), and the legacy
 * bare-master fallback must stay off.
 *
 *   npm run check:bridge
 *
 * CI cannot see the standard repo, so the canonical file is pinned by SHA-256
 * below. When the standard changes: copy the new file in, then update
 * CANONICAL_SHA256 in the same reviewed change. If a sibling checkout exists
 * at ../acacia-app-standard the script also compares against it directly.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const CANONICAL_SHA256 = "404daa44b2a33591bb76bd5e33738682c8e6da1464c70c6ae369f57776a0cecc";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sha = (b) => createHash("sha256").update(b).digest("hex");

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (name === "_acaciaSign.ts") yield p;
  }
}

const problems = [];
const copies = [...walk(join(root, "base44", "functions"))];
if (copies.length === 0) problems.push("no _acaciaSign.ts found under base44/functions");

const sibling = join(root, "..", "acacia-app-standard", "shared", "bridge", "acaciaSign.ts");
const siblingHash = existsSync(sibling) ? sha(readFileSync(sibling)) : null;
if (siblingHash && siblingHash !== CANONICAL_SHA256) {
  problems.push("the pinned CANONICAL_SHA256 no longer matches ../acacia-app-standard/shared/bridge/acaciaSign.ts; update the pin with the new copy");
}

for (const file of copies) {
  const buf = readFileSync(file);
  const rel = relative(root, file);
  if (sha(buf) !== CANONICAL_SHA256) problems.push(`${rel} differs from the canonical acaciaSign.ts`);
  if (!/ACCEPT_LEGACY_MASTER\s*=\s*false\b/.test(buf.toString("utf8"))) {
    problems.push(`${rel} must keep ACCEPT_LEGACY_MASTER = false`);
  }
}

if (!existsSync(join(root, "base44", "functions", "acaciaSign.test.ts"))) {
  problems.push("base44/functions/acaciaSign.test.ts (the shared cross-language vector) is missing");
}

if (problems.length) {
  console.error(`\n✗ check:bridge found ${problems.length} problem(s):\n`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error("\nA drifted signing helper shows up at runtime as `bad signature` on every call. See STANDARD.md module 15.\n");
  process.exit(1);
}
console.log(`✓ check:bridge — ${copies.length} copy(ies) match the canonical helper, legacy master off.`);

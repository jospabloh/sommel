#!/usr/bin/env node
/**
 * Module 19 guard: every security lock in scripts/lib/locks-rules.mjs must
 * still be present in base44/entities/*.jsonc, and must still carry its
 * rationale in a deployable description.
 *
 *   npm run validate:locks
 *
 * Adding a lock means adding it to the manifest on purpose. Removing one means
 * removing it from the manifest in the same reviewed change. Deployed-vs-repo
 * drift (point 4) is a separate check; see docs/locks-audit.md when it lands.
 */

import process from "node:process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { collectLockErrors, loadSchemas } from "./lib/locks-rules.mjs";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "base44", "entities");
const { errors, checked } = collectLockErrors(loadSchemas(dir));

if (errors.length > 0) {
  console.error(`\n✗ Lock validation FAILED (${errors.length} issue(s)):\n`);
  for (const e of errors) console.error(`  - ${e}`);
  console.error(
    "\nA security lock was loosened or lost its rationale. Do not loosen it to fix a symptom: " +
      "an rls.write rule never changes what a read returns. See STANDARD.md module 19.\n",
  );
  process.exit(1);
}
console.log(`✓ Lock validation passed (${checked} manifest entries).`);

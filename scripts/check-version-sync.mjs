#!/usr/bin/env node
// Module 6 / 21 guard: the version the user sees (About screen, update banner)
// is src/lib/appConfig.js, and it must be the same line as package.json.
// Fails when:
//   - package.json "version" differs from APP_VERSION;
//   - RELEASE_DATE is not an ISO date;
//   - CHANGELOG is empty, its newest entry is not APP_VERSION, that entry has
//     no non-empty change, or two entries share a version.
// The release script is the only writer of both files, so a failure here means
// somebody hand-edited one of them. Runs inside `npm run lint`.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import process from 'node:process';

const ROOT = new URL('..', import.meta.url).pathname;
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const cfg = await import(pathToFileURL(join(ROOT, 'src', 'lib', 'appConfig.js')).href);

const problems = [];
const { APP_VERSION, RELEASE_DATE, CHANGELOG } = cfg;

if (typeof APP_VERSION !== 'string' || !/^\d+\.\d+\.\d+$/.test(APP_VERSION)) {
  problems.push(`APP_VERSION must be MAJOR.MINOR.PATCH, got ${JSON.stringify(APP_VERSION)}`);
}
if (pkg.version !== APP_VERSION) {
  problems.push(`package.json version (${pkg.version}) differs from APP_VERSION (${APP_VERSION}). Run npm run release; do not hand-edit either.`);
}
if (typeof RELEASE_DATE !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(RELEASE_DATE) || Number.isNaN(Date.parse(RELEASE_DATE))) {
  problems.push(`RELEASE_DATE must be an ISO date (YYYY-MM-DD), got ${JSON.stringify(RELEASE_DATE)}`);
}
if (!Array.isArray(CHANGELOG) || CHANGELOG.length === 0) {
  problems.push('CHANGELOG must be a non-empty array');
} else {
  const head = CHANGELOG[0];
  if (head.version !== APP_VERSION) {
    problems.push(`CHANGELOG[0].version (${head.version}) must equal APP_VERSION (${APP_VERSION}); newest entry first`);
  }
  if (!Array.isArray(head.changes) || !head.changes.some((c) => typeof c === 'string' && c.trim())) {
    problems.push(`CHANGELOG entry for ${head.version} has no non-empty change`);
  }
  const seen = new Set();
  for (const entry of CHANGELOG) {
    if (seen.has(entry.version)) problems.push(`CHANGELOG lists version ${entry.version} twice`);
    seen.add(entry.version);
  }
}

if (problems.length) {
  console.error('check-version-sync: FAILED');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`check-version-sync: OK (v${APP_VERSION}, ${RELEASE_DATE}, ${CHANGELOG.length} changelog entries)`);

#!/usr/bin/env node
// Copies the canonical guard templates (scripts/templates/_guard.ts +
// _guard_logic.ts) into every Safe-function group's directory, and keeps
// _guard_logic.ts's PERMISSION_DEFAULTS block in sync with the single source
// of truth, src/lib/permissionRegistry.js (entrega-1-contratos.md §2/§3).
//
// Base44 doesn't share code between function directories, so each group
// needs its own literal copy — this script is how "nobody edits the copies"
// (contract §2) stays true: the template files are the only ones a human
// touches, this script (or its --check twin) is the only thing that writes
// to base44/functions/<fn>/_guard*.ts.
//
//   npm run generate:guards   — writes the copies
//   npm run check:guards      — fails (exit 1) on any drift, without writing
//
// TARGET_DIRS is deliberately the full list from contract §5 ("Menú API",
// "Comandas API", "Estaciones API" own base44/functions/{catalog,orders,
// stations}/**"). A feature agent adds entry.ts/handlers next to the guard
// copy that already lives there — this script never touches anything else
// in those directories.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TEMPLATES_DIR = join(ROOT, 'scripts', 'templates');
const FUNCTIONS_DIR = join(ROOT, 'base44', 'functions');
const REGISTRY_PATH = join(ROOT, 'src', 'lib', 'permissionRegistry.js');

export const TARGET_DIRS = [
  'catalog',
  'orders',
  'stations',
  'payments',
  'shifts',
  'inventory',
  'printing',
  'reports',
  'settings',
  'attendance',
];
const COPIED_FILES = ['_guard_logic.ts', '_guard.ts'];

// Function groups that send email get a copy of the shared email layout
// (scripts/templates/_email.ts). manageStaff is standalone (no _guard.ts),
// so it is listed here only.
export const EMAIL_TARGET_DIRS = ['shifts', 'manageStaff'];

const BEGIN_MARK = '// AUTOGEN:PERMISSION_DEFAULTS:BEGIN';
const END_MARK = '// AUTOGEN:PERMISSION_DEFAULTS:END';

function formatKey(key) {
  return JSON.stringify(key);
}

function renderPermissionDefaultsBlock(defaults) {
  const lines = Object.entries(defaults).map(
    ([key, v]) => `  ${formatKey(key)}: { bar_admin: ${!!v.bar_admin}, staff: ${!!v.staff} },`
  );
  return [
    `${BEGIN_MARK} — generado por scripts/generate-guards.mjs`,
    '// desde src/lib/permissionRegistry.js. No editar a mano.',
    'export const PERMISSION_DEFAULTS: Record<string, { bar_admin: boolean; staff: boolean }> = {',
    ...lines,
    '};',
    END_MARK,
  ].join('\n');
}

function replaceAutogenBlock(source, block) {
  const start = source.indexOf(BEGIN_MARK);
  const end = source.indexOf(END_MARK);
  if (start === -1 || end === -1) {
    throw new Error(`_guard_logic.ts template is missing the ${BEGIN_MARK}/${END_MARK} markers`);
  }
  const endOfEnd = end + END_MARK.length;
  return source.slice(0, start) + block + source.slice(endOfEnd);
}

/** Reads PERMISSION_DEFAULTS straight from the canonical registry module. */
export async function loadPermissionDefaults() {
  const mod = await import(pathToFileURL(REGISTRY_PATH).href);
  if (!mod.PERMISSION_DEFAULTS) {
    throw new Error(`${REGISTRY_PATH} does not export PERMISSION_DEFAULTS`);
  }
  return mod.PERMISSION_DEFAULTS;
}

/** Computes the up-to-date contents of every templates/copies as a Map<path, contents>. */
export async function buildExpectedFiles() {
  const defaults = await loadPermissionDefaults();
  const block = renderPermissionDefaultsBlock(defaults);

  const rawGuardLogic = readFileSync(join(TEMPLATES_DIR, '_guard_logic.ts'), 'utf8');
  const guardLogic = replaceAutogenBlock(rawGuardLogic, block);
  const guard = readFileSync(join(TEMPLATES_DIR, '_guard.ts'), 'utf8');
  const email = readFileSync(join(TEMPLATES_DIR, '_email.ts'), 'utf8');

  const files = new Map();
  files.set(join(TEMPLATES_DIR, '_guard_logic.ts'), guardLogic);
  files.set(join(TEMPLATES_DIR, '_guard.ts'), guard);
  for (const dir of TARGET_DIRS) {
    const fnDir = join(FUNCTIONS_DIR, dir);
    files.set(join(fnDir, '_guard_logic.ts'), guardLogic);
    files.set(join(fnDir, '_guard.ts'), guard);
  }
  for (const dir of EMAIL_TARGET_DIRS) {
    files.set(join(FUNCTIONS_DIR, dir, '_email.ts'), email);
  }
  return files;
}

function writeFiles(files) {
  for (const [path, contents] of files) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents, 'utf8');
  }
}

function checkFiles(files) {
  const problems = [];
  for (const [path, expected] of files) {
    if (!existsSync(path)) {
      problems.push(`missing: ${path}`);
      continue;
    }
    const actual = readFileSync(path, 'utf8');
    if (actual !== expected) {
      problems.push(`drift: ${path} does not match its canonical template/registry`);
    }
  }
  return problems;
}

async function main() {
  const checkOnly = process.argv.includes('--check');
  const files = await buildExpectedFiles();

  if (checkOnly) {
    const problems = checkFiles(files);
    if (problems.length) {
      console.error(`✗ check:guards found ${problems.length} problem(s):`);
      for (const p of problems) console.error(`  - ${p}`);
      console.error('  Run `npm run generate:guards` and commit the result.');
      process.exit(1);
    }
    console.log(`✓ check:guards — ${files.size} file(s) match their canonical source, no drift.`);
    return;
  }

  writeFiles(files);
  console.log(`✓ generate:guards — wrote ${files.size} file(s) (templates + ${COPIED_FILES.length * TARGET_DIRS.length} copies across ${TARGET_DIRS.length} function group(s)).`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('✗ generate-guards.mjs failed:', err.message);
    process.exit(1);
  });
}

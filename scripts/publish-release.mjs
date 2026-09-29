#!/usr/bin/env node
// Release publisher (module 6). The ONLY writer of APP_VERSION, RELEASE_DATE
// and CHANGELOG in src/lib/appConfig.js, and of the "version" field in
// package.json (and package-lock.json's two copies of it). Run by
// .github/workflows/auto-release-pr.yml on every push to main, which opens a
// release PR; nobody hand-edits those files per feature commit.
//
// Where the changelog comes from:
//   1. merged pull requests since the last release, read from the GitHub API
//      (GITHUB_TOKEN + GITHUB_REPOSITORY, both present in Actions);
//   2. if the API is not reachable, the non-merge commit subjects since the
//      last release.
// With ANTHROPIC_API_KEY_SOMMEL set, an LLM rewrites those titles into short
// Spanish lines for the bar's staff. Without it, the titles go in verbatim,
// so the module works with no secret at all.
//
// "Last release" = the last "chore: release" commit that touched
// src/lib/appConfig.js (falling back to the last commit that touched it).
// Pull requests from the release branch itself are ignored, so a merged
// release PR never produces another release.
//
// Usage: npm run release            (asks before writing, locally)
//        npm run release -- --dry   (prints the changelog, writes nothing)
//        CI=true npm run release    (no prompts; used by the workflow)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import process from 'node:process';
import { createInterface } from 'node:readline/promises';

const ROOT = new URL('..', import.meta.url).pathname;
const CONFIG_PATH = join(ROOT, 'src', 'lib', 'appConfig.js');
const PKG_PATH = join(ROOT, 'package.json');
const LOCK_PATH = join(ROOT, 'package-lock.json');
const RELEASE_BRANCH = 'automated/release-pr';
const DRY = process.argv.includes('--dry');
const INTERACTIVE = !process.env.CI && process.stdin.isTTY;

const sh = (cmd) => execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

export function isReleaseNoise(title = '', headRef = '') {
  return headRef === RELEASE_BRANCH || /^chore: release/i.test(title) || /automated release/i.test(title);
}

async function mergedPullRequests(sinceISO) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!token || !repo) return null;
  const res = await fetch(`https://api.github.com/repos/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=50`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
    },
  });
  if (!res.ok) {
    console.warn(`GitHub API respondió ${res.status}; se usarán los commits.`);
    return null;
  }
  const prs = await res.json();
  const since = Date.parse(sinceISO);
  return prs
    .filter((p) => p.merged_at && Date.parse(p.merged_at) > since && !isReleaseNoise(p.title, p.head?.ref))
    .sort((a, b) => Date.parse(a.merged_at) - Date.parse(b.merged_at))
    .map((p) => `#${p.number} ${p.title}`);
}

function commitSubjects(range) {
  const out = sh(`git log ${range} --no-merges --format=%s`);
  return out.split('\n').map((s) => s.trim()).filter((s) => s && !isReleaseNoise(s));
}

async function summarizeWithAnthropic(items, version) {
  const apiKey = process.env.ANTHROPIC_API_KEY_SOMMEL;
  if (!apiKey) return null;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5',
      max_tokens: 1024,
      system:
        'Redactas el registro de cambios de Sommel, un sistema de punto de venta para wine bars, en español de México. ' +
        'Escribe líneas cortas para el personal del bar (meseros, cajeros, administradores), sin jerga técnica, sin emojis y sin rayas largas. ' +
        'Omite cambios internos que un usuario no notaría. Devuelve SOLO un arreglo JSON de cadenas.',
      messages: [{ role: 'user', content: `Versión ${version}. Cambios (títulos de pull requests o commits):\n${items.join('\n')}` }],
    }),
  });
  if (!res.ok) {
    console.warn(`Anthropic respondió ${res.status}; se usarán los títulos tal cual.`);
    return null;
  }
  const data = await res.json();
  const match = (data.content?.[0]?.text ?? '').match(/\[[\s\S]*\]/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    const lines = parsed.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim());
    return lines.length ? lines : null;
  } catch {
    return null;
  }
}

async function main() {
  console.log('== Sommel release publisher ==');
  let configSrc = readFileSync(CONFIG_PATH, 'utf8');
  const versionMatch = configSrc.match(/export const APP_VERSION = "([^"]+)";/);
  if (!versionMatch) throw new Error('No se encontró APP_VERSION en src/lib/appConfig.js');
  const currentVersion = versionMatch[1];

  let lastReleaseCommit = '';
  let sinceISO = '1970-01-01T00:00:00Z';
  try {
    // Anchor on the last real release commit; a feature merge that also
    // touched appConfig.js (a seeded entry) must not swallow its own PR.
    lastReleaseCommit = sh("git log -1 --format=%H --grep='^chore: release' -- src/lib/appConfig.js");
    if (!lastReleaseCommit) lastReleaseCommit = sh('git log -1 --format=%H -- src/lib/appConfig.js');
    if (lastReleaseCommit) sinceISO = sh(`git log -1 --format=%cI ${lastReleaseCommit}`);
  } catch {
    /* no git history: treat everything as new */
  }

  let items = null;
  try {
    items = await mergedPullRequests(sinceISO);
  } catch (e) {
    console.warn(`No se pudo leer GitHub (${e.message}); se usarán los commits.`);
  }
  if (!items) {
    try {
      items = commitSubjects(lastReleaseCommit ? `${lastReleaseCommit}..HEAD` : '-10');
    } catch {
      items = [];
    }
  }
  if (!items.length) {
    console.log('No hay cambios nuevos desde el último release. No se escribe nada.');
    return;
  }
  console.log(`Cambios desde el último release:\n${items.map((i) => `  - ${i}`).join('\n')}`);

  const [major, minor, patch] = currentVersion.split('.').map(Number);
  let newVersion = `${major}.${minor}.${patch + 1}`;
  const rl = INTERACTIVE ? createInterface({ input: process.stdin, output: process.stdout }) : null;
  if (rl) {
    const typed = (await rl.question(`Nueva versión (default ${newVersion}): `)).trim();
    if (typed) newVersion = typed;
  }
  if (!/^\d+\.\d+\.\d+$/.test(newVersion)) throw new Error(`Versión inválida: ${newVersion}`);

  // Titles verbatim when there is no key: never a generic "Actualización" line,
  // so an entry always says what actually shipped.
  const changes = (await summarizeWithAnthropic(items, newVersion)) ?? items.map((i) => i.replace(/^#\d+\s+/, ''));
  console.log(`\nChangelog ${newVersion}:\n${changes.map((c) => `  - ${c}`).join('\n')}`);

  if (DRY) {
    console.log('\n--dry: no se escribió nada.');
    rl?.close();
    return;
  }
  if (rl) {
    const ok = (await rl.question('\n¿Escribir los cambios? (Y/n): ')).trim().toLowerCase();
    rl.close();
    if (ok === 'n') {
      console.log('Cancelado.');
      return;
    }
  }

  const dateStr = new Date().toISOString().split('T')[0];
  configSrc = configSrc
    .replace(/export const APP_VERSION = "[^"]+";/, `export const APP_VERSION = "${newVersion}";`)
    .replace(/export const RELEASE_DATE = "[^"]+";/, `export const RELEASE_DATE = "${dateStr}";`);
  const entry = `  {\n    version: "${newVersion}",\n    date: "${dateStr}",\n    changes: [\n${changes.map((c) => `      ${JSON.stringify(c)},`).join('\n')}\n    ],\n  },\n`;
  if (!/export const CHANGELOG = \[\n/.test(configSrc)) throw new Error('No se encontró "export const CHANGELOG = [" en appConfig.js');
  configSrc = configSrc.replace(/export const CHANGELOG = \[\n/, (m) => m + entry);
  writeFileSync(CONFIG_PATH, configSrc);

  const pkgSrc = readFileSync(PKG_PATH, 'utf8');
  writeFileSync(PKG_PATH, pkgSrc.replace(/("version":\s*")[^"]+(")/, `$1${newVersion}$2`));
  if (existsSync(LOCK_PATH)) {
    // Top-level "version" and packages[""].version: the first two occurrences.
    let n = 0;
    const lockSrc = readFileSync(LOCK_PATH, 'utf8').replace(/("version":\s*")[^"]+(")/g, (m, a, b) => (n++ < 2 ? `${a}${newVersion}${b}` : m));
    writeFileSync(LOCK_PATH, lockSrc);
  }
  console.log(`\nListo: ${currentVersion} -> ${newVersion}. Revisa el PR de release y mergéalo.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

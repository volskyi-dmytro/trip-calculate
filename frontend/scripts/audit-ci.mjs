#!/usr/bin/env node
/**
 * Production dependency audit gate for CI.
 *
 * Wraps `npm audit` because the bare command cannot express "this advisory has
 * no fix and does not apply to us", which otherwise blocks every deploy
 * indefinitely — `npm audit` re-queries the live advisory DB on each run, so a
 * lockfile that passed yesterday fails today with no code change.
 *
 * Scope is --omit=dev: devDependencies (eslint, typescript-eslint, their
 * transitive glob/minimatch chain) are build-time only and never enter the
 * Docker image, so they cannot reach users.
 *
 * Run locally with: npm run audit:ci
 */
import { execFileSync } from 'node:child_process';

/**
 * Advisories we accept, with the reason. Keep this list SHORT and re-check it
 * whenever a fix ships — an entry here is a standing risk acceptance, not a
 * way to silence noise.
 */
const ALLOWED = {};

const BLOCKING = new Set(['high', 'critical']);

// npm audit exits non-zero when it finds anything, so capture rather than throw.
let raw;
try {
  raw = execFileSync('npm', ['audit', '--omit=dev', '--json'], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
} catch (err) {
  raw = err.stdout;
  if (!raw) {
    console.error('npm audit produced no output:', err.message);
    process.exit(1);
  }
}

const report = JSON.parse(raw);
const blocking = [];
const waived = [];

for (const vuln of Object.values(report.vulnerabilities ?? {})) {
  if (!BLOCKING.has(vuln.severity)) continue;

  // `via` holds the advisory objects for direct hits and package-name strings
  // for packages that are only vulnerable through a dependency. A package with
  // no advisory objects is collateral — it clears once its parent does, so
  // judging it on its own would double-count.
  const advisories = vuln.via.filter((v) => typeof v === 'object');
  if (advisories.length === 0) continue;

  for (const adv of advisories) {
    const id = adv.url?.split('/').pop();
    (ALLOWED[id] ? waived : blocking).push({ id, name: vuln.name, title: adv.title });
  }
}

for (const w of waived) {
  console.log(`⚠️  waived  ${w.id}  ${w.name}: ${w.title}`);
  console.log(`           ${ALLOWED[w.id].reason}`);
}

if (blocking.length > 0) {
  console.error(`\n❌ ${blocking.length} unwaived high/critical advisory(ies) in production dependencies:\n`);
  for (const b of blocking) console.error(`   ${b.id}  ${b.name}: ${b.title}`);
  console.error('\nFix them, or add a documented entry to ALLOWED in this file.');
  process.exit(1);
}

console.log(`\n✅ No unwaived high/critical advisories in production dependencies (${waived.length} waived).`);

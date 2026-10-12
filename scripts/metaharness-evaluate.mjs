#!/usr/bin/env node
/** Repeatable evidence collection. The MetaHarness score is a heuristic, not a test result. */
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { searchTemplates, disposeSearch } from '../web/core/search.js';
import { templates } from '../web/core/model.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const outputIndex = args.indexOf('--output');
if (outputIndex >= 0 && !args[outputIndex + 1]) throw new Error('--output requires a path');
const testRun = spawnSync(process.execPath, ['--test', 'tests/ecosystem.test.js'], { cwd: root, encoding: 'utf8', timeout: 60_000 });
const wasm = await readFile(new URL('../web/vendor/ruvector/ruvector_wasm_bg.wasm', import.meta.url));
const cold = await searchTemplates('motion', templates, { wasmBytes: wasm });
const stats = {};
for (const backend of ['javascript', 'wasm']) {
  const samples = [];
  for (let i = 0; i < 50; i++) {
    const result = await searchTemplates(['motion', 'social', 'game', 'type'][i % 4], templates, { ...(backend === 'javascript' ? { backend } : { wasmBytes: wasm }) });
    if (backend === 'wasm' && result.backend !== 'ruvector-wasm') throw new Error(result.fallbackReason ?? 'WASM did not execute');
    samples.push(result.elapsedMs);
  }
  samples.sort((a, b) => a - b);
  stats[backend] = { iterations: samples.length, medianMs: samples[25], p95Ms: samples[47], maxMs: samples[49] };
}
disposeSearch();
const git = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
const gitStatus = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
const sourceSHA256 = {};
for (const file of ['web/core/search.js', 'web/core/resources.js', 'web/core/model.js', 'tests/ecosystem.test.js', 'scripts/metaharness-evaluate.mjs']) {
  sourceSHA256[file] = createHash('sha256').update(await readFile(resolve(root, file))).digest('hex');
}
let metaharness = { package: 'metaharness@0.4.17', status: 'not-requested', command: 'npm exec --yes --package=metaharness@0.4.17 --ignore-scripts --omit=optional -- metaharness score . --json' };
if (args.includes('--with-cli')) {
  const run = spawnSync('npm', ['exec', '--yes', '--package=metaharness@0.4.17', '--ignore-scripts', '--omit=optional', '--', 'metaharness', 'score', root, '--json'], { cwd: root, encoding: 'utf8', timeout: 180_000, maxBuffer: 2_000_000 });
  let scorecard;
  try { scorecard = JSON.parse(run.stdout); } catch { /* Preserve failure honestly. */ }
  metaharness = { ...metaharness, status: run.status === 0 && scorecard ? 'completed' : 'failed', exitCode: run.status, scorecard, error: run.error?.message, stderr: run.stderr?.trim(), note: 'Static repository heuristics. No agent training, self learning, test execution, or measured inference costs are implied by this scorecard.' };
}
const evidence = {
  schema: 1, generatedAt: new Date().toISOString(), commit: git.status === 0 ? git.stdout.trim() : null,
  dirty: gitStatus.status === 0 ? Boolean(gitStatus.stdout.trim()) : null, sourceSHA256,
  node: process.version, platform: process.platform, architecture: process.arch,
  tests: { command: 'node --test tests/ecosystem.test.js', exitCode: testRun.status, output: testRun.stdout, error: testRun.error?.message },
  search: { package: '@ruvector/wasm@0.2.1', wasmBytes: wasm.length, wasmSHA256: createHash('sha256').update(wasm).digest('hex'), embedding: '256-dimensional normalized hashed lexical tokens, not learned semantics', templateCount: templates.length, coldMs: cold.elapsedMs, measured: stats, note: 'Local Node measurements for this catalog; browser and device performance vary. WASM is optional and is not assumed faster for tiny catalogs.' },
  metaharness, acceptance: testRun.status === 0 && cold.backend === 'ruvector-wasm' && metaharness.status !== 'failed'
};
if (outputIndex >= 0) await writeFile(resolve(args[outputIndex + 1]), `${JSON.stringify(evidence, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
if (!evidence.acceptance) process.exitCode = 1;

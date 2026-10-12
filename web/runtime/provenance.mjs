import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url));
const files = ['Cargo.toml', 'Cargo.lock', 'crates/rash-runtime/Cargo.toml', 'crates/rash-runtime/src/lib.rs', 'scripts/build-wasm.sh'];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const wasm = readFileSync(new URL('./pkg/rash_runtime.wasm', import.meta.url));
writeFileSync(new URL('./pkg/provenance.json', import.meta.url), JSON.stringify({
  engine: 'rash-runtime', version: '0.1.0', target: 'wasm32-unknown-unknown',
  rustc: execFileSync('rustc', ['--version'], { encoding: 'utf8' }).trim(),
  artifactBytes: wasm.length, artifactSha256: digest(wasm),
  sourceSha256: Object.fromEntries(files.map(file => [file, digest(readFileSync(path.join(root, file)))])),
  command: 'sh scripts/build-wasm.sh',
}, null, 2) + '\n');

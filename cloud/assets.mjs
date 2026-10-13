/** Build-time Studio asset allowlist. No filesystem access occurs in the Worker. */
import { readdir, readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
const roots = new Set(['index.html', 'app.js', 'embed.js', 'player.html', 'player.js', 'core', 'export', 'styles', 'ui', 'runtime', 'vendor', 'mcp', 'examples', 'header']);
export async function collectStudioAssets(root = 'web') {
 const assets = Object.create(null);
 async function walk(relative = '') {
  for (const entry of await readdir(join(root, relative), { withFileTypes: true })) {
   const path = relative ? `${relative}/${entry.name}` : entry.name;
   if (!roots.has(path.split('/')[0]) || path.startsWith('vendor/ruffle') || path === 'runtime/legacy.js') continue;
   if (entry.isDirectory()) { await walk(path); continue; }
   // Symlinks and build scripts are deliberately excluded.
   const type = types[extname(path)] || (/^LICENSE(?:_[A-Z]+)?$/.test(entry.name) ? 'text/plain; charset=utf-8' : null);
   if (!entry.isFile() || !type) continue;
   const bytes = await readFile(join(root, path));
   assets[path] = { type, ...(extname(path) === '.wasm' ? { base64: bytes.toString('base64') } : { body: bytes.toString('utf8') }) };
  }
 }
 await walk();
 for (const required of ['index.html','app.js','runtime/pkg/rash_runtime.wasm','vendor/ruvector/ruvector_wasm_bg.wasm','vendor/three-vector.js']) {
  if (!Object.hasOwn(assets, required)) throw new Error(`Missing Studio asset: ${required}`);
 }
 return assets;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {REVISION} from '../web/vendor/three-vector.js';
test('Three.js runtime is pinned, licensed and within its transfer budget',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../web/vendor/three/provenance.json',import.meta.url),'utf8'));
 const bytes=await readFile(new URL('../web/vendor/three-vector.js',import.meta.url));
 const lock=JSON.parse(await readFile(new URL('../package-lock.json',import.meta.url),'utf8'));
 assert.equal(manifest.version,'0.186.1');assert.equal(REVISION,'186');assert.equal(manifest.npmIntegrity,lock.packages['node_modules/three'].integrity);
 assert.equal(manifest.sha256,createHash('sha256').update(bytes).digest('hex'));assert.equal(manifest.bytes,bytes.length);assert.ok(bytes.length<120000);assert.ok(gzipSync(bytes).length<40000);
 assert.match(await readFile(new URL('../web/vendor/three/LICENSE',import.meta.url),'utf8'),/MIT License/);
});

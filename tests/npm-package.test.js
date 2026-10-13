import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {access,readFile} from 'node:fs/promises';

const packageJson=JSON.parse(await readFile('package.json','utf8'));
const readme=await readFile('README.md','utf8');
const rawBase='https://raw.githubusercontent.com/ruvnet/Rash/main/';

test('npm metadata exposes a public scoped package without install lifecycle scripts',async()=>{
 assert.equal(packageJson.name,'@ruv/rash');assert.equal(packageJson.private,undefined);assert.equal(packageJson.publishConfig.access,'public');
 assert.deepEqual(packageJson.bin,{rash:'bin/rash.mjs','rash-mcp':'mcp/server.mjs'});
 for(const script of ['preinstall','install','postinstall','prepare','prepack'])assert.equal(packageJson.scripts[script],undefined,`${script} must not execute for consumers or packaging`);
 await access(packageJson.bin.rash);await access(packageJson.bin['rash-mcp']);
});

test('every README image uses an npmjs-safe absolute URL backed by a packaged file',async()=>{
 const urls=[...readme.matchAll(/<(?:img|source)\b[^>]*(?:src|srcset)="([^"]+)"|!\[[^\]]*\]\(([^)]+)\)/g)].map(match=>match[1]||match[2]);
 assert.ok(urls.length>=12,'Expected the animated header, examples and workflow art');
 for(const url of urls){
  assert.ok(url.startsWith(rawBase),`README image must use an absolute raw GitHub URL: ${url}`);
  const file=url.slice(rawBase.length);await access(file);if(file.endsWith('.svg'))assert.doesNotMatch(await readFile(file,'utf8'),/<script\b/i,`${file} must remain script free`);
 }
});

test('npm dry-run tarball contains runtimes and artwork but no repository or secret material',()=>{
 const [packed]=JSON.parse(execFileSync('npm',['pack','--dry-run','--json','--ignore-scripts'],{encoding:'utf8'}));
 const files=new Set(packed.files.map(file=>file.path));
 for(const file of ['bin/rash.mjs','mcp/server.mjs','web/index.html','web/runtime/pkg/rash_runtime.wasm','web/header/rash-header.svg','web/examples/06-studio-sequence.svg','docs/animations/mcp-guide.svg','LICENSE','README.md'])assert.ok(files.has(file),`${file} missing from npm package`);
 assert.ok(packed.size<15_000_000,`Packed package must remain below 15 MB; got ${packed.size}`);
 assert.ok(packed.unpackedSize<40_000_000,`Unpacked package must remain below 40 MB; got ${packed.unpackedSize}`);
 assert.ok([...files].every(file=>!/(^|\/)(\.git|node_modules|test-results|\.env)(\/|$)/.test(file)),'Tarball must exclude repository, dependency and secret paths');
});

test('CLI help and package exports load without starting a server',async()=>{
 assert.match(execFileSync(process.execPath,['bin/rash.mjs','--help'],{encoding:'utf8'}),/rash mcp/);
 const api=await import('../index.js');assert.equal(typeof api.createProject,'function');assert.equal(typeof api.sceneToSVG,'function');assert.equal(typeof api.exportProject,'function');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { lexicalVector, searchTemplates, disposeSearch } from '../web/core/search.js';
import { parseRashURI, createResourceRegistry } from '../web/core/resources.js';

const templates = [
  { id: 'orbit', name: 'Orbital motion', description: 'Planets rotate around a star', tags: ['space', 'science'] },
  { id: 'social', name: 'Social announcement', description: 'Portrait video story', tags: ['mobile', 'social'] },
  { id: 'game', name: 'Arcade game', description: 'Bounce and collect points', tags: ['game', 'interactive'] }
];

test('lexical vectors are finite, deterministic and normalized', () => {
  const a = lexicalVector('Game game 🎮');
  assert.deepEqual(a, lexicalVector('GAME GAME'));
  assert.ok(Math.abs(Math.hypot(...a) - 1) < 1e-6);
  assert.equal(lexicalVector('').some(Boolean), false);
});

test('real vendored RuVector WASM matches exact JavaScript search', async () => {
  const wasmBytes = await readFile(new URL('../web/vendor/ruvector/ruvector_wasm_bg.wasm', import.meta.url));
  for (const query of ['game', 'space', 'social', 'mobile video']) {
    const actual = await searchTemplates(query, templates, { wasmBytes });
    const baseline = await searchTemplates(query, templates, { backend: 'javascript' });
    assert.equal(actual.backend, 'ruvector-wasm', actual.fallbackReason);
    assert.deepEqual(actual.results.map(r => r.id), baseline.results.map(r => r.id));
    actual.results.forEach((r, i) => assert.ok(Math.abs(r.score - baseline.results[i].score) < 1e-5));
  }
  const changed = await searchTemplates('updated', [{ id: 'one', name: 'updated' }], { wasmBytes });
  assert.equal(changed.results[0].id, 'one');
  disposeSearch();
});

test('empty catalog, bounds and invalid input are handled', async () => {
  assert.deepEqual((await searchTemplates('a', [])).results, []);
  assert.equal((await searchTemplates('', templates)).backend, 'catalog');
  assert.deepEqual((await searchTemplates('🎮', templates)).results, []);
  await assert.rejects(searchTemplates('x'.repeat(513), []));
  await assert.rejects(searchTemplates('game', [...templates, templates[0]]));
  await assert.rejects(searchTemplates('game', Array(2001).fill(templates[0])));
});

test('an unavailable WASM engine reports the JavaScript fallback honestly', async () => {
  // Another test initialized wasm-bindgen globally; use a fresh process for the failure path.
  const { spawnSync } = await import('node:child_process');
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', `import {searchTemplates} from './web/core/search.js'; const r=await searchTemplates('game', [{id:'a',name:'game'}], {wasmBytes:new Uint8Array([0,1,2])}); console.log(JSON.stringify(r));`], { cwd: new URL('../', import.meta.url), encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const result = JSON.parse(run.stdout);
  assert.equal(result.backend, 'javascript-cosine');
  assert.ok(result.fallbackReason);
  assert.equal(result.results[0].id, 'a');
});

test('vendored assets match the pinned provenance hashes', async () => {
  const base = new URL('../web/vendor/ruvector/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('provenance.json', base), 'utf8'));
  for (const [name, expected] of Object.entries(manifest.files)) {
    const content = await readFile(new URL(name, base));
    assert.equal(content.length, expected.bytes, name);
    assert.equal(createHash('sha256').update(content).digest('hex'), expected.sha256, name);
  }
});

test('rash URI grammar rejects network, traversal, injection and ambiguous addresses', () => {
  assert.deepEqual(parseRashURI('rash://node/title'), { scheme: 'rash', type: 'node', id: 'title', uri: 'rash://node/title' });
  for (const value of ['https://site.com/a', 'rash://exec/bash', 'rash://node/../secret', 'rash://node/%2e%2e', 'rash://node/a%2fb', 'rash://node/a?x=1', 'rash://node/a#x', 'rash://user@node/a', 'rash://node/%00', 'rash://node/%', 'rash://node//a']) assert.throws(() => parseRashURI(value), value);
});

test('registry returns isolated data and bounded allowlisted controls', () => {
  const current = { id: 'demo', duration: 5, nodes: [{ id: 'title', text: 'Rash' }] };
  let sought;
  const registry = createResourceRegistry({ getProject: () => current, templates, controls: { seek: x => { sought = x; }, play: () => true } });
  const item = registry.resolve('rash://node/title');
  item.value.text = 'mutated';
  assert.equal(current.nodes[0].text, 'Rash');
  assert.equal(registry.resolve('rash://project/current').value.id, 'demo');
  assert.equal(registry.resolve('rash://template/game').value.id, 'game');
  assert.equal(registry.resolve('rash://help/embed').value.title, 'Embed a scene');
  assert.ok(registry.list().includes('rash://node/title'));
  registry.control('seek', 4);
  assert.equal(sought, 4);
  for (const value of [-1, 5, 6, 1.5, Infinity, NaN, '3']) assert.throws(() => registry.control('seek', value));
  assert.throws(() => registry.control('fetch', 'https://example.com'));
  assert.throws(() => registry.control('select', 'unknown'));
  assert.throws(() => registry.resolve('rash://help/__proto__'));
  assert.throws(() => registry.resolve('rash://project/other'));
});

test('symbol resources expose cloned definitions and no descendant control authority', () => {
  const current={id:'symbols',duration:60,nodes:[],symbols:[{id:'pulse',nodes:[{id:'child',fill:'#ff0000'}]}]};
  const registry=createResourceRegistry({getProject:()=>current});
  assert.ok(registry.list().includes('rash://symbol/pulse'));
  const item=registry.resolve('rash://symbol/pulse');item.value.nodes[0].fill='#00ff00';
  assert.equal(current.symbols[0].nodes[0].fill,'#ff0000');
  assert.throws(()=>registry.resolve('rash://symbol/missing'),/not found/);
  assert.throws(()=>registry.control('select','child'),/Unknown/);
  assert.throws(()=>parseRashURI('rash://symbol/%2e%2e'));
});

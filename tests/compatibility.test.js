import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { bindWasm } from '../web/runtime/wasm.js';

// Exercise the same committed Rust binary and ABI used by the browser worker.
// These fixtures are RashScript contracts, not an ActionScript conformance suite.
const bytes = await readFile(new URL('../web/runtime/pkg/rash_runtime.wasm', import.meta.url));
const { instance } = await WebAssembly.instantiate(bytes, {});
const run = bindWasm(instance);
const matrix = JSON.parse(await readFile(new URL('./fixtures/compatibility.json', import.meta.url), 'utf8'));
const context = {frame:12,fps:30,width:1280,height:720,nodes:[{id:'hero-id',name:'hero',x:10,y:20,opacity:1}]};

for (const status of ['supported','divergences']) {
  for (const row of matrix[status]) test(`compatibility ${status}: ${row.id}`, () => {
    const result = run(row.source, context);
    assert.equal(result.error, undefined);
    assert.deepEqual(result.logs, row.logs);
    assert.deepEqual(result.commands, row.commands ?? []);
  });
}
for (const row of matrix.rejected) test(`compatibility rejected atomically: ${row.id}`, () => {
  const result = run('hero.x=99;' + row.source, context);
  assert.equal(typeof result.error, 'string');
  if (row.error) assert.match(result.error, new RegExp(row.error, 'i'));
  assert.deepEqual(result.commands, [], 'Failure must discard earlier commands');
});
test('compatibility: invocation state does not persist', () => {
  assert.equal(run('var session=9;hero.x=42;', context).error, undefined);
  assert.ok(run('trace(session);', context).error);
  assert.deepEqual(run('trace(hero.x);', context).logs, ['10']);
});
test('compatibility: source limit rejects before execution', () => {
  const result = run('hero.x=99;/*' + 'x'.repeat(65_536) + '*/', context);
  assert.match(result.error, /64 KiB/);
  assert.deepEqual(result.commands, []);
});

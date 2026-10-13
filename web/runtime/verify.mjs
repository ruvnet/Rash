import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { bindWasm } from './wasm.js';

const bytes = readFileSync(new URL('./pkg/rash_runtime.wasm', import.meta.url));
const { instance } = await WebAssembly.instantiate(bytes, {});
const run = bindWasm(instance);
const context = { frame: 12, frameLabels: [{frame:7,name:'Intro'}], fps: 30, width: 1280, height: 720, nodes: [{ id: 'hero1', name: 'hero', x: 10, y: 20, opacity: 1 }] };
const result = run('var total:Number=0; for(var i:int=0;i<10;i++){total+=i;} hero.x=total; hero._alpha=50; trace(total); gotoAndStop("Intro");', context);
assert.equal(result.error, undefined);
assert.deepEqual(result.logs, ['45']);
assert.deepEqual(result.commands[0], { type: 'set', id: 'hero1', property: 'x', value: 45 });
assert.equal(result.commands[1].value, 0.5);
assert.deepEqual(result.commands[2], { type: 'goto', frame: 7, play: false });
assert.match(run('hero.x=99;gotoAndStop("Missing");', context).error, /Unknown frame label/);
assert.deepEqual(run('hero.x=99;gotoAndStop("Missing");', context).commands, []);
assert.match(run('while(true) {}', context).error, /budget/);
assert.match(run('eval("alert(1)");', context).error, /Unsupported/);
assert.deepEqual(run('hero.x=99; fetch("https://example.com");', context).commands, []);
assert.match(run('class Clip {}', context).error, /Unsupported/);
const motion=run('hero.rotationX=30;hero.rotationY+=90;hero.glow=6;hero.primitive="torus";hero.wireframe=true;',context);
assert.equal(motion.error,undefined);assert.equal(motion.commands.length,5);assert.equal(motion.commands[1].value,90);
const times = [];
for (let i = 0; i < 120; i++) {
  const start = performance.now();
  const r = run('for(var i=0;i<100;i++){hero.x=i*2;hero.y=Math.sin(i)*100;} trace("done");', context);
  assert.equal(r.error, undefined);
  times.push(performance.now() - start);
}
times.sort((a,b) => a-b);
console.log(JSON.stringify({ engine: 'actual Rust WASM', bytes: bytes.length, smoke: 'PASS', runs: times.length, commandCountPerRun: 200, medianMs: +times[60].toFixed(3), p95Ms: +times[114].toFixed(3) }));

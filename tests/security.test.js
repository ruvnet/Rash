import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createProject, normalizeNode, validateProject, parseProject, safeColor, evaluateScene } from '../web/core/model.js';
import { sceneToSVG } from '../web/core/renderer.js';
import { animatedSVG } from '../web/export/svg.js';
import { embedCode, exportProject } from '../web/export/export.js';
import { bindWasm } from '../web/runtime/wasm.js';

// Loading the class without constructing it lets Node exercise its URL and fetch boundaries.
// Real shadow DOM and lifecycle behavior is covered by the browser suite.
globalThis.HTMLElement ??= class {};
globalThis.customElements ??= { get() { return undefined; }, define() {} };
const { validateSourceURL, RashPlayer } = await import('../web/embed.js');
const base = 'https://studio.example/Rash/';

test('scene schema rejects executable shapes, attributes and remote paint', () => {
  for (const type of ['script', 'foreignObject', 'image', 'use', 'a', 'animate', 'constructor', '__proto__']) {
    const node = normalizeNode({ id: 'payload', type, fill: 'url(https://invalid.example/pixel)', href: 'javascript:alert(1)', onload: 'alert(1)', style: 'filter:url(https://invalid.example)' });
    assert.equal(node.type, 'rect');
    for (const property of ['href', 'onload', 'style', '__proto__']) assert.equal(Object.hasOwn(node, property), false);
    assert.equal(node.fill, '#ffffff');
  }
});

test('JSON prototype names stay data and cannot pollute Object.prototype', () => {
  const text = '{"version":1,"name":"safe","nodes":[{"id":"__proto__","type":"text","text":"safe","__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}],"__proto__":{"polluted":true}}';
  const project = parseProject(text);
  assert.equal(({}).polluted, undefined);
  assert.equal(Object.hasOwn(project, '__proto__'), false);
  assert.equal(Object.hasOwn(project.nodes[0], '__proto__'), false);
  assert.equal(Object.hasOwn(project.nodes[0], 'constructor'), false);
  assert.ok(sceneToSVG(project).includes('data-node-id="__proto__"'));
});

test('serialized SVG and HTML keep hostile Unicode and tag delimiters as text', async () => {
  const p = createProject('blank');
  p.name = '</title><script>alert(1)</script>\u2028';
  p.nodes = [{ id: 'text', type: 'text', text: '</text></svg><img src=x onerror=alert(1)> & " \'', keyframes: [{ frame: 0, x: 0 }, { frame: 12, x: 40 }] }];
  for (const svg of [sceneToSVG(p), animatedSVG(p)]) {
    assert.equal(/<(script|img|image|foreignObject)\b/i.test(svg), false);
    assert.match(svg, /&lt;img/);
  }
  const html = await (await exportProject(p, 'html')).blob.text();
  assert.equal((html.match(/<script>/g) || []).length, 1); // Only the fixed reduced-motion helper.
  assert.equal(html.includes('<img'), false);
});

test('paths discard XML and URL delimiters, IDs discard attribute delimiters', () => {
  const node = normalizeNode({ id: 'x" onload="attack()', type: 'path', d: 'M0,0 L20,20"/><script>evil()</script> url(https://bad.example/x)' });
  assert.match(node.id, /^[\w-]+$/);
  assert.equal(/[<>"'/:()]/.test(node.d), false);
  assert.equal(safeColor('url(#mask)'), '#ffffff');
  assert.equal(safeColor('red; background:url(https://bad.example)'), '#ffffff');
});

test('numeric fields and malformed project shapes cannot introduce NaN or Infinity', () => {
  const p = createProject('blank');
  p.nodes = [{ id: 'one', x: Infinity, y: NaN, opacity: -100, scale: -100, keyframes: [{ frame: Infinity, x: NaN, opacity: 2 }] }];
  const clean = validateProject(p);
  assert.equal(clean.nodes[0].opacity, 0);
  assert.equal(clean.nodes[0].scale, 0.001);
  assert.ok(!/NaN|Infinity/.test(sceneToSVG(clean)));
  for (const bad of [null, [], {version:1,nodes:null}, {...p, nodes:[null]}]) assert.throws(() => validateProject(bad));
  assert.throws(() => parseProject(' '.repeat(5_000_001)), /limit/);
});

test('animated dimensions stay within the renderer geometry bounds', () => {
  const p = createProject('blank');
  p.nodes = [{ id:'bounds', type:'rect', width:100, height:100, keyframes:[
    {frame:0,width:100,height:100},
    {frame:30,width:-100,height:100_000,easing:'linear'}
  ] }];
  const clean = validateProject(p);
  for (const frame of [0, 15, 30, 100]) {
    const node = evaluateScene(clean, frame)[0];
    assert.ok(node.width >= 1 && node.width <= 10_000);
    assert.ok(node.height >= 1 && node.height <= 10_000);
  }
});

test('aggregate keyframe limit prevents an oversized DOM timeline', () => {
  const p = createProject('blank');
  p.nodes = Array.from({length:11}, (_,i) => ({
    id:`layer${i}`, keyframes:Array.from({length:1000}, (_,frame) => ({frame,x:frame}))
  }));
  assert.throws(() => validateProject(p), /10,000 keyframes/);
});

test('embed URL policy rejects credentials, active schemes and cross-origin HTTP', () => {
  for (const url of ['javascript:alert(1)', 'data:application/json,{}', 'file:///project.json', 'blob:https://studio.example/id', 'https://user:pass@example.org/project.json', 'http://other.example/project.json']) assert.throws(() => validateSourceURL(url, base));
  assert.equal(validateSourceURL('./project.json', base).href, 'https://studio.example/Rash/project.json');
  assert.equal(validateSourceURL('./project.json', 'http://localhost:4173/Rash/').href, 'http://localhost:4173/Rash/project.json');
  assert.equal(validateSourceURL('https://cdn.example/project.json', base).protocol, 'https:');
});

function fakePlayer() {
  const player = {
    hasAttribute: name => name === 'src',
    getAttribute: () => 'https://cdn.example/project.json',
    _error(error) { this.error = error.message; },
    assigned: null,
  };
  Object.defineProperty(player, 'project', { set(value) { this.assigned = value; } });
  return player;
}

test('embed fetch omits credentials, rejects redirects and cancels streamed oversize input', async () => {
  const oldFetch = globalThis.fetch;
  let options, canceled = false;
  globalThis.fetch = async (_url, args) => {
    options = args;
    return { ok: true, headers: new Headers(), body: { getReader: () => ({ read: async () => ({ done: false, value: new Uint8Array(5_000_001) }), cancel: async () => { canceled = true; } }) } };
  };
  try {
    const player = fakePlayer();
    await RashPlayer.prototype.load.call(player);
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
    assert.equal(options.mode, 'cors');
    assert.equal(canceled, true);
    assert.match(player.error, /5 MB/);
    assert.equal(player.assigned, null);
  } finally { globalThis.fetch = oldFetch; }
});

test('embed declared size limit rejects without opening response body', async () => {
  const oldFetch = globalThis.fetch;
  let read = false;
  globalThis.fetch = async () => ({ ok: true, headers: new Headers({ 'content-length': '5000001' }), body: { getReader() { read = true; } } });
  try {
    const player = fakePlayer();
    await RashPlayer.prototype.load.call(player);
    assert.match(player.error, /5 MB/);
    assert.equal(read, false);
  } finally { globalThis.fetch = oldFetch; }
});

test('embed JSON cannot close its inert script container', () => {
  const p = createProject('blank');
  p.script = '</ScRiPt><svg onload="alert(1)">\u2028\u2029&';
  const code = embedCode(p, {baseURL: base});
  assert.equal((code.match(/<script\b/gi) || []).length, 2);
  const json = code.match(/<script type="application\/json">([\s\S]*?)<\/script>/)[1];
  assert.equal(json.includes('<'), false);
  assert.equal(JSON.parse(json).script, p.script);
});

test('actual Rust WASM rejects host access and commits no partial scene effects', async () => {
  const bytes = await readFile(new URL('../web/runtime/pkg/rash_runtime.wasm', import.meta.url));
  const { instance } = await WebAssembly.instantiate(bytes, {});
  const run = bindWasm(instance);
  const context = { nodes:[{id:'hero',name:'hero',x:0}], fps:30, width:1280, height:720 };
  for (const source of [
    'hero.x=1; eval("alert(1)");',
    'hero.x=1; fetch("https://invalid.example");',
    'hero.x=1; hero.innerHTML="<script>";',
    'hero.x=1; hero.fill="url(https://invalid.example)";',
    'hero.x=1; while(true) {}',
    `trace(${"(".repeat(200)}1${")".repeat(200)});`,
    `trace('${'x'.repeat(16_385)}');`
  ]) {
    const output = run(source, context);
    assert.equal(typeof output.error, 'string');
    assert.deepEqual(output.commands, []);
    assert.ok((output.steps || 0) <= 50_001);
  }
  assert.match(run(' '.repeat(65_537), context).error, /64 KiB/);
  assert.match(run('', {extra:'x'.repeat(2_097_152)}).error, /2 MiB/);
  assert.deepEqual(run('trace(2+2);', context).logs, ['4']);
  const namedFill = run("hero.fill='red';", context);
  assert.equal(namedFill.error, undefined);
  assert.equal(safeColor(namedFill.commands[0].value), 'red');
  for (const value of ['#12345', '#1234567', 'red; color:blue']) assert.equal(safeColor(value), '#ffffff');
});

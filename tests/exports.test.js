import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, addNode, setLayerExposure } from '../web/core/model.js';
import { exportProject, embedCode, mp4Support } from '../web/export/export.js';
import { GIFEncoder, lzwEncode, quantizeRGBA } from '../web/export/gif.js';
import { createImagePDF } from '../web/export/pdf.js';
function decodeLZW(bytes) {
  let at = 0, bit = 0, size = 9, dictionary = [], previous = null;
  const output = [];
  const reset = () => { dictionary = Array.from({ length: 256 }, (_, i) => [i]); dictionary.push(null, null); size = 9; previous = null; };
  reset();
  const read = () => { let n = 0; for (let i = 0; i < size; i++) { if (at >= bytes.length) throw Error('Truncated LZW'); n |= ((bytes[at] >> bit) & 1) << i; if (++bit === 8) { bit = 0; at++; } } return n; };
  while (true) {
    const code = read();
    if (code === 256) { reset(); continue; }
    if (code === 257) break;
    const value = dictionary[code] || (code === dictionary.length && previous ? [...previous, previous[0]] : null);
    if (!value) throw Error(`Invalid LZW code ${code}`);
    output.push(...value);
    if (previous && dictionary.length < 4096) { dictionary.push([...previous, value[0]]); if (dictionary.length === (1 << size) && size < 12) size++; }
    previous = value;
  }
  return Uint8Array.from(output);
}
test('GIF LZW round-trips random pixels through dictionary growth and resets', () => {
  let seed = 9182;
  const bytes = Uint8Array.from({ length: 100000 }, () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed & 255; });
  assert.deepEqual(decodeLZW(lzwEncode(bytes)), bytes);
  assert.deepEqual(decodeLZW(lzwEncode(new Uint8Array(20000).fill(17))), new Uint8Array(20000).fill(17));
});
test('GIF encoder outputs GIF89a with frames and terminator', async () => {
  const encoder = new GIFEncoder(2, 2);
  const rgba = Uint8Array.from([255,0,0,255, 0,255,0,255, 0,0,255,255, 0,0,0,0]);
  assert.deepEqual([...quantizeRGBA(rgba)], [224, 28, 3, 255]);
  encoder.addFrame(rgba, 8); encoder.addFrame(rgba, 12);
  const bytes = new Uint8Array(await encoder.finish().arrayBuffer());
  assert.equal(new TextDecoder().decode(bytes.slice(0,6)), 'GIF89a');
  assert.equal(bytes.at(-1), 59); assert.equal(encoder.frames, 2);
  assert.throws(() => encoder.addFrame(rgba), /finalized/);
});
test('JSON and animated SVG exports are valid and escaped', async () => {
  const p = createProject('orbit'); p.name = '<script>alert(1)</script>';
  p.nodes.find(n => n.type === 'text').text = 'Safe <image onload="evil()"> & sound';
  const json = await exportProject(p, 'json');
  assert.equal(JSON.parse(await json.blob.text()).nodes.length, p.nodes.length);
  const svg = await (await exportProject(p, 'svg')).blob.text();
  assert.ok(svg.includes('<animateTransform')); assert.ok(svg.includes('repeatCount="indefinite"'));
  assert.ok(svg.includes('&lt;image onload=&quot;evil()&quot;&gt;'));
  assert.ok(!svg.includes('<script>')); assert.ok(!svg.includes('<image'));
});
test('animated SVG exports preserve blank and exposed keyframe holds', async () => {
  const p=createProject('orbit');p.duration=6;const node=p.nodes[0];setLayerExposure(p,node.id,1,false);setLayerExposure(p,node.id,4,true);
  const svg=await (await exportProject(p,'svg')).blob.text(),group=svg.match(new RegExp(`<g data-node-id="${node.id}"[^>]*>([\\s\\S]*?)<\\/g>`))?.[0]||'';
  assert.match(group,/display="inline"/);assert.match(group,/attributeName="display"/);assert.match(group,/values="inline;none;none;none;inline;inline;inline"/);
});
test('animated SVG and embed exports preserve canonical spatial cubic samples', async () => {
  const p=createProject('blank');p.duration=3;const node=addNode(p);node.x=0;node.y=0;
  node.keyframes=[{frame:0,x:0,y:0,easing:'linear'},{frame:2,x:100,y:0,easing:'linear',spatial:{out:[0,100],in:[0,100]}}];
  const svg=await (await exportProject(p,'svg')).blob.text();
  assert.match(svg,/type="translate" values="0 0;50 75;100 0;100 0"/);
  const snippet=embedCode(p,{baseURL:'https://example.org/Rash/'});
  assert.match(snippet,/"spatial":\{"out":\[0,100\],"in":\[0,100\]\}/);
});
test('embed snippets cannot break out of inline JSON and reject unsafe script URLs', () => {
  const p = createProject('blank'); p.script = '</script><script>alert(1)</script>\u2028';
  const snippet = embedCode(p, { baseURL: 'https://example.org/Rash/' });
  assert.ok(snippet.includes('https://example.org/Rash/embed.js'));
  assert.ok(snippet.includes('\\u003c/script\\u003e'));
  assert.equal((snippet.match(/<script/g) || []).length, 2);
  assert.throws(() => embedCode(p, { baseURL: 'javascript:alert(1)' }));
  assert.throws(() => embedCode(p, { baseURL: 'https://user:secret@example.com/' }), /credentials/);
});
test('HTML is self contained, uses escaped title, and honors reduced motion', async () => {
  const p = createProject('orbit'); p.name = '</title><img src=x onerror=evil()>';
  const html = await (await exportProject(p, 'html')).blob.text();
  assert.ok(html.includes('pauseAnimations'));
  assert.ok(!html.includes('<img')); assert.ok(!html.includes('src="http'));
});
test('PDF xref offsets and binary stream length are byte accurate', async () => {
  const jpeg = Uint8Array.from([255,216,255,224,0,16,128,255,217]);
  const bytes = new Uint8Array(await createImagePDF(jpeg, 640, 480).arrayBuffer());
  const text = Buffer.from(bytes).toString('latin1');
  assert.ok(text.startsWith('%PDF-1.4')); assert.ok(text.includes('/MediaBox [0 0 480 360]'));
  const xref = Number(text.match(/startxref\n(\d+)/)[1]); assert.equal(text.slice(xref, xref+4), 'xref');
  const entries = text.slice(xref).split('\n').slice(3,8);
  entries.forEach((entry,i) => { const offset = Number(entry.slice(0,10)); assert.equal(text.slice(offset,offset+7), `${i+1} 0 obj`); });
});
test('unsupported formats and MP4 fail explicitly outside supported browsers', async () => {
  const p = createProject('blank');
  await assert.rejects(exportProject(p, 'webm'), /Unknown export format/);
  assert.equal(mp4Support(), false);
  await assert.rejects(exportProject(p, 'mp4'), /MP4 recording is unavailable/);
});
test('animated SVG rejects pathological keyframe evaluation before sampling', async () => {
  const p = createProject('orbit'); p.duration = 1000;
  p.nodes[0].keyframes = Array.from({length:1000},(_,i)=>({frame:i,x:i}));
  await assert.rejects(exportProject(p,'svg'), /evaluation budget/);
});

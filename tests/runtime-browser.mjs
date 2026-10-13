import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createCompatibilitySwf } from '../scripts/generate-compatibility-swf.mjs';

const root = path.resolve('web');
const server = http.createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (pathname === '/runtime-test.html') { response.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>Runtime test</title>'); return; }
  const file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  try {
    const bytes = await fs.readFile(file);
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm' };
    response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' }).end(bytes);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '0.0.0.0', resolve));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;
const browser = await chromium.launch({ headless: true });
try {
  // Explicit BCP-47 locale avoids the container's nonstandard en-US@posix value.
  const page = await browser.newPage({ locale: 'en-US' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '/runtime-test.html');
  const runInBrowser = async (moduleUrl) => page.evaluate(async url => {
    const { createRuntime } = await import(url);
    const runtime = await createRuntime();
    const result = await runtime.run('var n=getNode("hero"); n.x+=20; trace(n.x);', { nodes: [{ id: 'hero', x: 10 }] });
    const loop = await runtime.run('while(true) {}');
    runtime.dispose();
    return { kind: runtime.kind, result, loop };
  }, moduleUrl);
  for (const url of [base + '/runtime/client.js', `http://localhost:${port}/runtime/client.js`]) {
    const result = await runInBrowser(url);
    assert.equal(result.kind, 'rust-wasm-worker');
    assert.deepEqual(result.result.logs, ['30']);
    assert.equal(result.result.commands[0].value, 30);
    assert.match(result.loop.error, /budget/);
    assert.deepEqual(result.loop.commands, []);
  }
  await page.goto(base + '/legacy.html');
  await page.locator('#swf-file').setInputFiles({ name: 'invalid.swf', mimeType: 'application/octet-stream', buffer: Buffer.from('not a flash file') });
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('not a SWF'));
  await page.locator('#load-demo').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Playing ') || document.querySelector('#status').textContent.startsWith('Player error'), { timeout: 35000 });
  assert.match(await page.locator('#status').textContent(), /^Playing /);
  const frame = page.frames().find(candidate => candidate !== page.mainFrame());
  const isolation = await frame.evaluate(async () => {
    let blocked = false;
    let storageBlocked = false;
    let parentBlocked = false;
    try { await fetch('https://example.com/leak'); } catch { blocked = true; }
    try { localStorage.setItem('probe', 'true'); } catch { storageBlocked = true; }
    try { parent.document.body; } catch { parentBlocked = true; }
    return { blocked, storageBlocked, parentBlocked, canvas: !!document.querySelector('ruffle-player')?.shadowRoot?.querySelector('canvas') };
  });
  assert.deepEqual(isolation, { blocked: true, storageBlocked: true, parentBlocked: true, canvas: true });
  assert.equal(await page.locator('#legacy-player').getAttribute('sandbox'), 'allow-scripts');
  await page.locator('#stop-player').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('disposed'));
  // Authored AVM1 pair: only ActionSetProperty moves the orange shape from
  // x=0 to x=80. Pixel evidence distinguishes script execution from SWF load.
  const pixelPage = await browser.newPage();
  const centroids = [];
  for (const scripted of [false, true]) {
    const fixtureName = `avm1-${scripted ? 'scripted' : 'control'}.swf`;
    const fixture = createCompatibilitySwf(scripted);
    await page.locator('#legacy-player').evaluate(el => {el.style.width='320px';el.style.height='200px';el.style.minHeight='0';});
    await page.locator('#swf-file').setInputFiles({name:fixtureName,mimeType:'application/x-shockwave-flash',buffer:fixture});
    await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Playing ') || document.querySelector('#status').textContent.startsWith('Player error'), {timeout:35000});
    assert.match(await page.locator('#status').textContent(), /^Playing /);
    const movie = page.frames().find(candidate => candidate !== page.mainFrame());
    const canvas = movie.locator('ruffle-player').locator('canvas');
    await canvas.waitFor();
    await movie.locator('ruffle-player').click(); // Dismiss Ruffle's browser audio permission overlay.
    let measurement;
    for (let attempt=0;attempt<30;attempt++) {
      const closeNotice=movie.locator('#hardware-acceleration-modal .close-modal');
      if(await closeNotice.isVisible())await closeNotice.click();
      const unmute=movie.locator('#unmute-overlay');
      if(await unmute.isVisible())await unmute.click();
      const png = await canvas.screenshot();
      measurement = await pixelPage.evaluate(async bytes => {
        const bitmap=await createImageBitmap(new Blob([Uint8Array.from(bytes)],{type:'image/png'}));
        const out=document.createElement('canvas');out.width=bitmap.width;out.height=bitmap.height;
        const ctx=out.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();
        const data=ctx.getImageData(0,0,out.width,out.height).data;let count=0,sumX=0;
        for(let y=0;y<out.height;y++)for(let x=0;x<out.width;x++){
          const i=(y*out.width+x)*4;
          if(data[i]>230&&data[i+1]>90&&data[i+1]<170&&data[i+2]<30){count++;sumX+=x;}
        }
        return {coverage:count/(out.width*out.height),centroid:count?sumX/count/out.width:null};
      }, [...png]);
      if(measurement.coverage>0.05)break;
      await page.waitForTimeout(100);
    }
    assert.ok(measurement.coverage>0.05, `${fixtureName} must render an orange shape`);
    const expected=scripted?0.625:0.125;
    assert.ok(Math.abs(measurement.centroid-expected)<0.025, `${fixtureName}: expected centroid ${expected}, observed ${measurement.centroid}`);
    centroids.push(measurement.centroid);
    await page.locator('#stop-player').click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('disposed'));
  }
  assert.ok(centroids[1]-centroids[0]>0.45, 'AVM1 property write must visibly move the shape');
  await pixelPage.close();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ runtime: 'Rust WASM worker', sameOrigin: 'PASS', crossOriginBlobWorker: 'PASS', legacySWF: 'PASS', avm1ScriptedPropertyPixels: 'PASS', avm1ControlCentroids: centroids, opaqueSandbox: 'PASS', networkBlocked: 'PASS', storageBlocked: 'PASS', parentAccessBlocked: 'PASS', closeDisposesPlayer: 'PASS' }));
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}

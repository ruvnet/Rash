import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, webkit } from 'playwright';
import { createProject, addNode, validateProject } from '../web/core/model.js';

const browserName = process.env.RASH_BROWSER || 'chromium';
assert.ok(['chromium', 'webkit'].includes(browserName));
const root = path.resolve('web');
const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.wasm':'application/wasm','.json':'application/json','.svg':'image/svg+xml'};
let exportedSVG = '';
const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/camera.svg') { res.writeHead(200, {'Content-Type':'image/svg+xml'}).end(exportedSVG); return; }
    let file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://local').pathname));
    if (file === root) file = path.join(root, 'index.html');
    if (!file.startsWith(root + path.sep)) throw Error('Invalid path');
    res.writeHead(200, {'Content-Type':types[path.extname(file)] || 'application/octet-stream'}).end(await fs.readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = process.env.RASH_TEST_URL || `http://127.0.0.1:${server.address().port}/`;
const browser = await ({chromium, webkit}[browserName]).launch({headless:true, ...(browserName === 'chromium' ? {args:['--no-sandbox']} : {})});
const directory = path.resolve('test-results/camera-' + browserName);
await fs.mkdir(directory, {recursive:true});
const errors = [], checks = [];
let active = 'boot', phone;
const page = await browser.newPage({viewport:{width:1600,height:1000}, hasTouch:true});
page.setDefaultTimeout(10000);
page.on('pageerror', error => errors.push(error.message));
const tap = locator => locator.tap();
const project = (p = page) => p.evaluate(() => window.RashStudio.getProject());
const input = async (label, value, p = page) => { const el = p.getByLabel(label, {exact:true}); await tap(el); await el.fill(String(value)); };
const close = (p = page) => tap(p.locator('#modal').getByRole('button', {name:'Close dialog',exact:true}));
const geometry = (p, id) => p.locator(`#stage [data-node-id="${id}"] [data-face-id]`).evaluateAll(nodes => nodes.map(n => n.getAttribute('d')).join('|'));
const check = async (name, fn) => { active = name; await fn(); checks.push(name); console.log('PASS', name); };
async function command(name, p = page) {
  await tap(p.getByRole('button', {name:'Open command palette',exact:true}));
  await p.getByLabel('Search commands', {exact:true}).fill(name);
  await tap(p.locator('#command-list button').first());
}
async function blankBox() {
  await command('New composition');
  await tap(page.locator('[data-wizard-template="blank"]'));
  await tap(page.locator('[data-wizard-preset="classic"]'));
  const replace = page.getByRole('checkbox', {name:/Replace the current composition/});
  if (await replace.count()) await tap(replace);
  await tap(page.locator('[data-action="create-project"]'));
  await tap(page.locator('.mode-tabs [data-action="three-workspace"]'));
  await tap(page.locator('[data-primitive="box"]'));
  return (await project()).nodes.at(-1).id;
}
async function preset(id, p = page) {
  await tap(p.getByRole('button', {name:'Browse motion presets',exact:true}));
  await tap(p.locator(`[data-motion-preset="${id}"]`));
  await input('Motion duration in seconds', 2, p);
  await tap(p.getByRole('button', {name:'Apply motion',exact:true}));
}
async function bounds(selector) {
  const measured = await page.waitForFunction(selector => {
    const r = document.querySelector(selector)?.getBoundingClientRect();
    return r?.width > 0 && r?.height > 0 ? {x:r.x,y:r.y,width:r.width,height:r.height} : false;
  }, selector);
  const result = await measured.jsonValue(); await measured.dispose(); return result;
}
try {
  await page.goto(base); await page.waitForFunction(() => window.RashStudio);
  let meshId, beforeCurve, cameraProject;
  await check('independent rotation and opacity easing changes midpoint output', async () => {
    meshId = await blankBox(); await input('3D rotation Y', 0);
    await tap(page.getByRole('tab', {name:'Motion',exact:true}));
    await preset('spin3d'); await preset('blurReveal');
    await tap(page.getByRole('button', {name:'Go to keyframe 61',exact:true}));
    await page.getByLabel('Motion property', {exact:true}).selectOption('rotationY');
    await page.getByLabel('Keyframe easing', {exact:true}).selectOption('linear');
    await page.getByLabel('Motion property', {exact:true}).selectOption('opacity');
    await page.getByLabel('Keyframe easing', {exact:true}).selectOption('easeOut');
    await input('Current frame', 31);
    const sample = await page.evaluate(async id => {
      const {evaluateNode} = await import('./core/model.js');
      return evaluateNode(window.RashStudio.getProject().nodes.find(n => n.id === id), 30);
    }, meshId);
    assert.equal(sample.rotationY, 180); assert.equal(sample.opacity, .75);
    assert.equal(Number(await page.locator(`#stage [data-node-id="${meshId}"]`).getAttribute('opacity')), .75);
  });
  await check('property Bezier edits and a graph gesture preserve unrelated timing and undo', async () => {
    await tap(page.getByRole('button', {name:'Go to keyframe 61',exact:true}));
    await page.getByLabel('Keyframe easing', {exact:true}).selectOption('bezier');
    await input('Bezier x1', .12); await input('Bezier y1', .8); await input('Bezier x2', .7); await input('Bezier y2', 1.2);
    beforeCurve = await project();
    const key = beforeCurve.nodes.find(n => n.id === meshId).keyframes.find(k => k.frame === 60);
    assert.deepEqual(key.curves.opacity.bezier, [.12,.8,.7,1.2]); assert.equal(key.curves.rotationY.easing, 'linear');
    await page.locator('#curve-graph').scrollIntoViewIfNeeded();
    const graph = await bounds('#curve-graph'), handle = await bounds('[data-curve-handle="0"]');
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down();
    await page.mouse.move(graph.x + graph.width * .45, graph.y + graph.height * .5, {steps:6}); await page.mouse.up();
    assert.notDeepEqual(await project(), beforeCurve);
    await command('Undo'); assert.deepEqual(await project(), beforeCurve);
    await command('Redo');
    const after = (await project()).nodes.find(n => n.id === meshId).keyframes.find(k => k.frame === 60);
    assert.deepEqual(after.curves.rotationY, key.curves.rotationY);
  });
  await check('all properties mode reports mixed timing and explicitly resets overrides', async () => {
    const before = await project();
    await page.getByLabel('Motion property', {exact:true}).selectOption('all');
    assert.equal(await page.getByLabel('Keyframe easing', {exact:true}).inputValue(), 'mixed');
    await page.getByLabel('Keyframe easing', {exact:true}).selectOption('linear');
    const key = (await project()).nodes.find(n => n.id === meshId).keyframes.find(k => k.frame === 60);
    assert.equal(key.easing, 'linear'); assert.equal(Object.keys(key.curves || {}).length, 0);
    await command('Undo'); assert.deepEqual(await project(), before);
  });
  await check('independent curves survive save and reload', async () => {
    await page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('Saved on this device'));
    const before = await project(); await page.reload(); await page.waitForFunction(() => window.RashStudio);
    assert.deepEqual(await project(), before);
  });
  await check('visible camera controls animate a mesh with no object keyframes', async () => {
    meshId = await blankBox(); await input('Glow', 1);
    await tap(page.getByRole('button', {name:'Scene camera',exact:true}));
    await input('Camera yaw', -30); await page.getByLabel('Camera easing', {exact:true}).selectOption('linear');
    await tap(page.getByRole('button', {name:'Set camera keyframe',exact:true}));
    const first = await geometry(page, meshId);
    await input('Camera frame', 61); await input('Camera yaw', 40);
    await page.getByLabel('Camera easing', {exact:true}).selectOption('linear');
    await tap(page.getByRole('button', {name:'Set camera keyframe',exact:true}));
    assert.notEqual(await geometry(page, meshId), first);
    await input('Camera frame', 31); assert.equal(Number(await page.getByLabel('Camera yaw', {exact:true}).inputValue()), 5);
    cameraProject = await project(); assert.equal(cameraProject.camera.keyframes.length, 2);
    assert.equal(cameraProject.nodes.find(n => n.id === meshId).keyframes.length, 0);
    assert.notEqual(await geometry(page, meshId), first);
    await page.screenshot({path:path.join(directory, 'camera-dialog.png'), fullPage:true}); await close();
    assert.equal(await page.locator('[data-camera-keyframe]').count(), 2);
  });
  await check('camera key removal and undo restore exact authored tracks', async () => {
    await tap(page.getByRole('button', {name:'Scene camera',exact:true}));
    await tap(page.getByRole('button', {name:'Go to camera keyframe 61',exact:true}));
    await tap(page.getByRole('button', {name:'Remove camera keyframe',exact:true}));
    assert.equal((await project()).camera.keyframes.length, 1); await close();
    await command('Undo'); assert.deepEqual(await project(), cameraProject);
  });
  await check('FPS changes retime camera keys and undo restores them', async () => {
    await page.getByLabel('Frames per second', {exact:true}).selectOption('60');
    assert.deepEqual((await project()).camera.keyframes.map(k => k.frame), [0,120]);
    await command('Undo'); assert.deepEqual(await project(), cameraProject);
  });
  await check('invalid camera input leaves the project and undo history usable', async () => {
    await tap(page.getByRole('button', {name:'Scene camera',exact:true}));
    await input('Camera distance', 100);
    await tap(page.getByRole('button', {name:'Set camera keyframe',exact:true}));
    assert.match(await page.locator('#camera-error').textContent(), /range/i);
    assert.deepEqual(await project(), cameraProject); await close();
  });
  await check('camera tracks survive reload and export sampled standalone SVG', async () => {
    await page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('Saved on this device'));
    await page.reload(); await page.waitForFunction(() => window.RashStudio);
    assert.deepEqual(await project(), cameraProject);
    await command('Export composition'); await tap(page.locator('[data-format="svg"]'));
    const pending = page.waitForEvent('download'); await tap(page.locator('[data-action="download-export"]'));
    const download = await pending; exportedSVG = await fs.readFile(await download.path(), 'utf8');
    assert.match(exportedSVG, /data-mesh-frame=/); assert.ok(Buffer.byteLength(exportedSVG) < 16_000_000); await close();
    await page.screenshot({path:path.join(directory, 'desktop.png'), fullPage:true});
  });
  await check('standalone SVG camera animation changes pixels with exactly one visible mesh frame', async () => {
    const svg = await browser.newPage({viewport:{width:550,height:400}});
    await svg.goto(`http://127.0.0.1:${server.address().port}/camera.svg`);
    const sample = async time => {
      await svg.evaluate(time => { document.documentElement.pauseAnimations(); document.documentElement.setCurrentTime(time); }, time);
      await svg.waitForTimeout(80);
      assert.equal(await svg.locator('[data-mesh-frame]').evaluateAll(nodes => nodes.filter(n => getComputedStyle(n).display !== 'none').length), 1);
      return svg.screenshot();
    };
    assert.notDeepEqual(await sample(0), await sample(1)); await svg.close();
  });
  await check('finite but unsafe camera easing rejects atomically and preserves redo', async () => {
    const fixture = createProject('blank');
    fixture.camera.distance = 1000;
    fixture.camera.keyframes = [{frame:0,distance:1000,easing:'linear'}];
    const mesh = addNode(fixture, 'mesh'); Object.assign(mesh, {primitive:'sphere',width:900,height:900,glow:1});
    const unsafe = await browser.newPage({viewport:{width:1600,height:1000},hasTouch:true});
    unsafe.on('pageerror', error => errors.push(error.message));
    await unsafe.addInitScript(p => localStorage.setItem('rash-studio-project-v1', JSON.stringify(p)), validateProject(fixture));
    await unsafe.goto(base); await unsafe.waitForFunction(() => window.RashStudio);
    await tap(unsafe.locator('#layer-list [data-layer] .layer-name').first());
    await unsafe.getByLabel('Fill color', {exact:true}).fill('#123456');
    const edited = await project(unsafe); await command('Undo', unsafe); const before = await project(unsafe);
    await tap(unsafe.getByRole('button', {name:'Scene camera',exact:true}));
    await input('Camera frame', 61, unsafe); await input('Camera distance', 740, unsafe);
    await unsafe.getByLabel('Camera easing', {exact:true}).selectOption('elastic');
    await tap(unsafe.getByRole('button', {name:'Set camera keyframe',exact:true}));
    assert.match(await unsafe.locator('#camera-error').textContent(), /filter/i);
    assert.deepEqual(await project(unsafe), before); assert.equal(await unsafe.locator('#modal').evaluate(el => el.open), true);
    await close(unsafe); await command('Redo', unsafe); assert.deepEqual(await project(unsafe), edited);
    await unsafe.close();
  });
  await check('phone touch controls author camera poses and independent property curves', async () => {
    phone = await browser.newPage({viewport:{width:390,height:844}, hasTouch:true, isMobile:true});
    phone.on('pageerror', error => errors.push(error.message));
    await phone.goto(base); await phone.waitForFunction(() => window.RashStudio);
    await tap(phone.locator('.mobile-nav').getByRole('button', {name:'More',exact:true}));
    await tap(phone.getByRole('button', {name:'3D objects and camera',exact:true})); await tap(phone.locator('[data-primitive="box"]'));
    const id = (await project(phone)).nodes.at(-1).id;
    await tap(phone.getByRole('button', {name:'Scene camera',exact:true})); await input('Camera yaw', -25, phone);
    await tap(phone.getByRole('button', {name:'Set camera keyframe',exact:true}));
    await input('Camera frame', 61, phone); await input('Camera yaw', 35, phone);
    await tap(phone.getByRole('button', {name:'Set camera keyframe',exact:true})); await close(phone);
    assert.equal((await project(phone)).camera.keyframes.length, 2);
    await tap(phone.getByRole('button', {name:'Edit selected layer',exact:true}));
    await tap(phone.getByRole('tab', {name:'Motion',exact:true})); await input('Current frame', 1, phone);
    await preset('spin3d', phone); await preset('blurReveal', phone);
    await tap(phone.getByRole('button', {name:'Go to keyframe 61',exact:true}));
    await phone.getByLabel('Motion property', {exact:true}).scrollIntoViewIfNeeded();
    await phone.getByLabel('Motion property', {exact:true}).selectOption('opacity');
    await phone.getByLabel('Keyframe easing', {exact:true}).selectOption('easeOut');
    await phone.getByLabel('Keyframe easing', {exact:true}).scrollIntoViewIfNeeded();
    const key = (await project(phone)).nodes.find(n => n.id === id).keyframes.find(k => k.frame === 60);
    assert.equal(key.curves.opacity.easing, 'easeOut'); assert.equal(key.curves.rotationY.easing, 'linear');
    await phone.screenshot({path:path.join(directory, 'phone-curves.png'), fullPage:true});
    await tap(phone.getByRole('button', {name:'Close inspector',exact:true}));
    const before = await project(phone); await tap(phone.getByRole('button', {name:'Delete selected layer',exact:true}));
    assert.equal((await project(phone)).nodes.length, before.nodes.length - 1);
    await tap(phone.getByRole('button', {name:'Undo',exact:true})); assert.deepEqual(await project(phone), before);
    await phone.waitForFunction(() => document.querySelector('#save-status').textContent.includes('Saved on this device'));
    await phone.reload(); await phone.waitForFunction(() => window.RashStudio); assert.deepEqual(await project(phone), before);
    assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await phone.screenshot({path:path.join(directory, 'phone.png'), fullPage:true});
  });
  await check('no uncaught errors during camera and property authoring', async () => assert.deepEqual(errors, []));
  await fs.writeFile(path.join(directory, 'evidence.json'), JSON.stringify({url:base,browser:browserName,checks,errors,limitations:['Browser emulation; physical phone testing remains separate.']}, null, 2));
  console.log(`${checks.length} ${browserName} camera checks passed`);
} catch (error) {
  await (phone || page).screenshot({path:path.join(directory, 'failure.png'),fullPage:true}).catch(() => {});
  await fs.writeFile(path.join(directory, 'evidence.json'), JSON.stringify({url:base,browser:browserName,checks,failedCheck:active,error:error.message,errors}, null, 2));
  throw error;
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }

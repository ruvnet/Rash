import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

// This suite uses visible UI controls and browser touch input. RashStudio is read
// only here: a DOM class toggling is not acceptance evidence for scene editing.
// Headless touch emulation does not validate the physical iOS software keyboard.
const root = path.resolve('web');
const mime = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.wasm':'application/wasm', '.json':'application/json'};
const server = http.createServer(async (request, response) => {
  try {
    let file = path.resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://local').pathname));
    if (file === root) file = path.join(root, 'index.html');
    if (!file.startsWith(root + path.sep)) throw Error('Outside web root');
    response.writeHead(200, {'Content-Type':mime[path.extname(file)] || 'application/octet-stream'}).end(await fs.readFile(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = process.env.RASH_TEST_URL || `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({headless:true, args:['--no-sandbox']});
const context = await browser.newContext({viewport:{width:390,height:844}, isMobile:true, hasTouch:true, deviceScaleFactor:1, locale:'en-US', acceptDownloads:true});
const page = await context.newPage();
page.setDefaultTimeout(8000);
const cdp = await context.newCDPSession(page);
const errors = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
let currentCheck = 'boot',mp4Result='not tested';
const evidenceDir = path.resolve('test-results/mobile');
await fs.mkdir(evidenceDir, {recursive:true});
const check = async (name, action) => { currentCheck = name; await action(); checks.push(name); console.log('PASS', name); };
const tap = locator => locator.tap();
const button = name => page.getByRole('button', {name, exact:true});
const project = () => page.evaluate(() => window.RashStudio.getProject());
const getFrame = () => page.evaluate(() => window.RashStudio.getFrame());
const node = async id => (await project()).nodes.find(n => n.id === id);
const closeModal = () => tap(page.locator('#modal').getByRole('button', {name:'Close dialog',exact:true}));
const closeInspector = async () => {if(await button('Close inspector').isVisible())await tap(button('Close inspector'));};
const edit = () => tap(button('Edit selected layer'));
async function setProperty(label, value) {
  const input = page.getByLabel(label, {exact:true});
  await tap(input); await input.fill(String(value));
  // Blur with a real touch outside the input, rather than dispatching change.
  await page.locator('#right-panel .property-tabs').tap({position:{x:7,y:7}});
}
async function touchDrag(from, to) {
  const point = (x,y) => [{x,y,id:0,radiusX:4,radiusY:4,force:1}];
  await cdp.send('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:point(from.x,from.y)});
  for(let step=1;step<=8;step++) await cdp.send('Input.dispatchTouchEvent', {type:'touchMove',touchPoints:point(from.x+(to.x-from.x)*step/8,from.y+(to.y-from.y)*step/8)});
  await cdp.send('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]});
}
async function stagePoint(x,y) {
  const p = await project(), box = await page.locator('#stage').boundingBox();
  assert.ok(box?.width > 20 && box?.height > 20, 'The editable stage must occupy usable screen space');
  return {x:box.x + x / p.width * box.width,y:box.y + y / p.height * box.height};
}
async function tapStage(x,y) { const p = await stagePoint(x,y); await page.touchscreen.tap(p.x,p.y); }
async function chooseTool(name) { await tap(page.locator('.mobile-nav').getByRole('button',{name:'Draw',exact:true})); await tap(page.locator('#modal').getByRole('button',{name,exact:true})); }
async function more(action) {
  await tap(page.locator('.mobile-nav').getByRole('button',{name:'More',exact:true}));
  await tap(page.locator('#modal [data-action="'+action+'"], #menu [data-action="'+action+'"]'));
}
async function openLayers() { await tap(page.locator('.mobile-nav').getByRole('button',{name:'Layers',exact:true})); }
async function selectLayer(id) { await openLayers(); await tap(page.locator('#layer-list [data-layer="'+id+'"] .layer-name')); }
async function downloadVia(action, outputName, timeout=15000) {
  const pending = page.waitForEvent('download',{timeout}); await action(); const download = await pending;
  assert.equal(await download.failure(), null);
  const output = path.join(evidenceDir, outputName); await download.saveAs(output);
  return {filename:download.suggestedFilename(),bytes:await fs.readFile(output)};
}

let rectangleId, textId, copyId;
try {
  await page.goto(base); await page.waitForFunction(() => window.RashStudio);
  await page.waitForFunction(() => document.querySelector('#engine-status').textContent.includes('Rust'));
  await check('portrait UI fits the viewport and exposes touch editing controls', async () => {
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    for (const name of ['Undo','Redo']) {
      const box = await button(name).boundingBox(); assert.ok(box && box.width >= 44 && box.height >= 44, name+' is a touch target');
    }
    assert.ok(await page.locator('.mobile-nav').getByRole('button',{name:'More',exact:true}).isVisible());
  });
  await check('touch wizard creates the selected blank canvas and name', async () => {
    await tap(page.locator('.mobile-nav').getByRole('button',{name:'New',exact:true}));
    await tap(page.locator('[data-wizard-template="blank"]'));
    await tap(page.locator('[data-wizard-preset="classic"]'));
    await page.getByLabel('COMPOSITION NAME',{exact:true}).fill('Mobile touch acceptance');
    await tap(page.locator('[data-action="create-project"]'));
    const p = await project(); assert.equal(p.name,'Mobile touch acceptance'); assert.equal(p.width,550); assert.equal(p.height,400); assert.equal(p.nodes.length,0);
  });
  await check('real touch drag draws and selects a rectangle', async () => {
    await chooseTool('Rectangle'); await touchDrag(await stagePoint(45,45), await stagePoint(195,145));
    const p = await project(); assert.equal(p.nodes.length,1); const n=p.nodes[0]; rectangleId=n.id;
    assert.equal(n.type,'rect'); assert.ok(n.width>140 && n.height>90);
    assert.ok(await button('Edit selected layer').isVisible()); assert.ok(await button('Delete selected layer').isVisible());
  });
  await check('touching a visible corner handle resizes the selected SVG object', async () => {
    const before=await node(rectangleId), handle=await page.locator('#stage [data-resize="se"]').boundingBox();
    assert.ok(handle && handle.width>0 && handle.height>0,'Selection exposes an interactive resize handle');
    const start={x:handle.x+handle.width/2,y:handle.y+handle.height/2}; await touchDrag(start,{x:start.x+18,y:start.y+12});
    const after=await node(rectangleId); assert.ok(after.width>before.width+10 && after.height>before.height+10);
  });
  await check('touch selection and drag move the existing SVG object', async () => {
    await tapStage(400,300); await tapStage(90,90);
    const before = await node(rectangleId);
    await touchDrag(await stagePoint(90,90),await stagePoint(125,115));
    const after = await node(rectangleId); assert.ok(after.x>=before.x+30 && after.y>=before.y+20);
  });
  await check('mobile inspector commits a numeric property edit to the scene', async () => {
    await edit(); await setProperty('X position',72); assert.equal((await node(rectangleId)).x,72); await closeInspector();
  });
  await check('touch selection after undo preserves redo history', async () => {
    await tap(button('Undo')); assert.notEqual((await node(rectangleId)).x,72);
    const current = await node(rectangleId); await tapStage(current.x+15,current.y+15);
    await tap(button('Redo')); assert.equal((await node(rectangleId)).x,72);
  });
  await check('visible duplicate and delete controls change the project and undo restores it', async () => {
    await tap(button('Duplicate selected layer')); let p=await project(); assert.equal(p.nodes.length,2); copyId=p.nodes.find(n=>n.id!==rectangleId).id;
    await tap(button('Delete selected layer')); assert.equal((await project()).nodes.length,1);
    await tap(button('Undo')); assert.equal((await project()).nodes.length,2);
    await tap(button('Redo')); assert.equal((await project()).nodes.length,1);
  });
  await check('touch creates text and the text dialog saves edited content', async () => {
    await chooseTool('Text'); await tapStage(80,240);
    textId=(await project()).nodes.find(n=>n.type==='text').id;
    await edit(); await tap(button('Edit text content'));
    await page.locator('#modal').getByLabel('Text content',{exact:true}).fill('Touch edit completed\nSecond line');
    await tap(page.locator('#modal').getByRole('button',{name:'Apply text',exact:true}));
    assert.equal((await node(textId)).text,'Touch edit completed\nSecond line');
    assert.match(await page.locator('#stage > g[data-node-id="'+textId+'"] text').textContent(),/Touch edit completed/);
    assert.deepEqual(await page.locator('#stage > g[data-node-id="'+textId+'"] text tspan').allTextContents(),['Touch edit completed','Second line']);
    await closeInspector();
  });
  await check('a layer can be renamed from the touch inspector', async () => {
    await edit(); await tap(page.locator('#inspector [data-action="rename-layer"]'));
    await page.getByLabel('LAYER NAME',{exact:true}).fill('Mobile headline'); await tap(button('Save name'));
    assert.equal((await node(textId)).name,'Mobile headline'); await closeInspector();
  });
  await check('layer visibility controls hide and restore actual SVG content', async () => {
    await openLayers(); await tap(button('Hide Mobile headline')); assert.equal((await node(textId)).visible,false);
    assert.equal(await page.locator('#stage > g[data-node-id="'+textId+'"]').getAttribute('display'),'none');
    await tap(button('Show Mobile headline')); assert.equal((await node(textId)).visible,true);
    await tap(button('Close layers'));
  });
  await check('layer lock prevents touch movement and destructive editing', async () => {
    await openLayers(); await tap(button('Lock Mobile headline')); await tap(button('Close layers'));
    const before=await node(textId); await touchDrag(await stagePoint(before.x+20,before.y+30),await stagePoint(before.x+70,before.y+45));
    assert.deepEqual(await node(textId),before);
    await selectLayer(textId);
    assert.ok(await button('Delete selected layer').isDisabled());
    await edit();
    for(const selector of ['[data-property="x"]','[data-property="text"]','[data-action="rename-layer"]','[data-action="edit-text"]','[data-action="toggle-fill"]','[data-action="bring-forward"]','[data-action="send-backward"]','[data-action="delete"]']) {
      assert.ok(await page.locator('#inspector '+selector).isDisabled(),'Locked inspector control: '+selector);
    }
    await tap(page.locator('#right-panel').getByRole('tab',{name:'Motion',exact:true}));assert.ok(await button('Add keyframe here').isDisabled());
    await closeInspector();assert.deepEqual(await node(textId),before);
    await openLayers(); await tap(button('Unlock Mobile headline')); await tap(button('Close layers'));
  });
  await check('mobile arrange controls change actual stacking order', async () => {
    await selectLayer(textId); await edit(); await tap(page.locator('#inspector [data-action="send-backward"]'));
    assert.equal((await project()).nodes[0].id,textId);
    await tap(page.locator('#inspector [data-action="bring-forward"]')); assert.equal((await project()).nodes.at(-1).id,textId);
    await closeInspector();
  });
  await check('touch motion inspector creates keyframes at exact requested frames', async () => {
    await selectLayer(rectangleId); await edit(); await tap(page.locator('#right-panel').getByRole('tab',{name:'Motion',exact:true}));
    await setProperty('Current frame',1); await tap(button('Add keyframe here'));
    await setProperty('Current frame',31); assert.equal(await getFrame(),30); await tap(button('Add keyframe here'));
    assert.deepEqual((await node(rectangleId)).keyframes.map(k=>k.frame),[0,30]);
    await page.getByLabel('Keyframe easing',{exact:true}).selectOption('easeInOut'); assert.equal((await node(rectangleId)).keyframes[1].easing,'easeInOut');
    await closeInspector();
  });
  await check('keyframe position editing changes rendered animation and exact seeking works', async () => {
    await edit(); await tap(page.locator('#right-panel').getByRole('tab',{name:'Properties',exact:true}));
    await setProperty('X position',250); assert.equal((await node(rectangleId)).keyframes[1].x,250);
    await tap(page.locator('#right-panel').getByRole('tab',{name:'Motion',exact:true}));
    await tap(button('Go to keyframe 1')); assert.equal(await getFrame(),0);
    await tap(button('Go to keyframe 31')); assert.equal(await getFrame(),30);
    const transform=await page.locator('#stage > g[data-node-id="'+rectangleId+'"]').getAttribute('transform'); assert.match(transform,/translate\(250 /);
    await tap(button('Previous frame')); assert.equal(await getFrame(),29); await tap(button('Next frame')); assert.equal(await getFrame(),30);
    await closeInspector();
  });
  await check('removing a keyframe through touch UI is undoable', async () => {
    await edit(); await tap(page.locator('#right-panel').getByRole('tab',{name:'Motion',exact:true})); await tap(button('Remove this keyframe')); assert.deepEqual((await node(rectangleId)).keyframes.map(k=>k.frame),[0]);
    await closeInspector(); await tap(button('Undo')); assert.deepEqual((await node(rectangleId)).keyframes.map(k=>k.frame),[0,30]);
  });
  await check('touch timeline seeks and playback advances frames', async () => {
    const box=await page.locator('#tracks-scroll').boundingBox(); await page.touchscreen.tap(box.x+Math.min(115,box.width-10),box.y+12);
    const start=await getFrame(); assert.ok(start>0); await tap(button('Play animation')); await page.waitForTimeout(220);
    assert.ok(await getFrame()>start); await tap(button('Pause animation'));
  });
  await check('mobile More menu exposes help, scripts, resources and embed dialogs', async () => {
    await more('help'); assert.ok(await page.locator('#modal').getByText('Your first animation, in three moves.',{exact:true}).isVisible()); await closeModal();
    await more('script'); await page.getByLabel('ActionScript editor',{exact:true}).fill('trace("mobile-worker-ok");'); await tap(button('Run script'));
    await page.waitForFunction(()=>document.querySelector('#script-output').textContent.includes('mobile-worker-ok')); await closeModal();
    await more('resources'); await page.getByLabel('RESOURCE ADDRESS',{exact:true}).fill('rash://project/current'); await tap(page.locator('[data-action="resolve-resource"]'));
    assert.match(await page.locator('#resource-result').textContent(),/Mobile touch acceptance/); await closeModal();
    await more('share'); assert.match(await page.getByLabel('JAVASCRIPT EMBED',{exact:true}).inputValue(),/<rash-player/); await closeModal();
  });
  await check('closing Actions saves unexecuted source after the previous autosave has settled', async () => {
    await page.waitForFunction(()=>document.querySelector('#save-status').textContent.includes('Saved on this device'));
    await more('script'); await page.getByLabel('ActionScript editor',{exact:true}).fill('trace("closed-source-persisted");'); await closeModal();
    await page.waitForFunction(()=>document.querySelector('#save-status').textContent.includes('Saved on this device'));
    await page.reload(); await page.waitForFunction(()=>window.RashStudio);
    assert.equal((await project()).script,'trace("closed-source-persisted");');
  });
  await check('mobile save downloads edited project data and import restores it', async () => {
    const saved=await downloadVia(()=>more('save'),'mobile.rash.json'); assert.match(saved.filename,/\.rash\.json$/);
    const p=JSON.parse(saved.bytes.toString()); assert.equal(p.name,'Mobile touch acceptance'); assert.equal(p.nodes.find(n=>n.id===textId).text,'Touch edit completed\nSecond line');
    await selectLayer(textId); await tap(button('Delete selected layer')); assert.equal((await project()).nodes.length,1);
    const chooserPending=page.waitForEvent('filechooser'); await more('import'); const chooser=await chooserPending;
    await chooser.setFiles({name:'mobile.rash.json',mimeType:'application/json',buffer:saved.bytes});
    await page.waitForFunction(()=>window.RashStudio.getProject().nodes.length===2);
    assert.equal((await node(textId)).text,'Touch edit completed\nSecond line');
  });
  await check('mobile export downloads real SVG with the edited content', async () => {
    await more('export'); const output=await downloadVia(()=>tap(page.locator('[data-action="download-export"]')),'mobile.svg');
    assert.match(output.filename,/\.svg$/); assert.match(output.bytes.toString(),/<svg /); assert.match(output.bytes.toString(),/Touch edit completed/); assert.match(output.bytes.toString(),/<tspan[^>]*>Second line<\/tspan>/); await closeModal();
  });
  await check('all image, document and source format buttons download their actual file formats', async () => {
    await more('export');
    for(const format of ['png','gif','pdf','html','json']) {
      await tap(page.locator('[data-format="'+format+'"]'));
      const output=await downloadVia(()=>tap(page.locator('[data-action="download-export"]')),'mobile.'+format);
      assert.ok(output.bytes.length>50,format+' contains data');
      if(format==='png') {
        assert.equal(output.bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
        assert.equal(output.bytes.readUInt32BE(16),550);assert.equal(output.bytes.readUInt32BE(20),400);
      }
      if(format==='gif')assert.equal(output.bytes.subarray(0,6).toString(),'GIF89a');
      if(format==='pdf')assert.match(output.bytes.subarray(0,8).toString(),/^%PDF-/);
      if(format==='html'){assert.match(output.bytes.toString(),/<!doctype html>/i);assert.match(output.bytes.toString(),/Touch edit completed/);}
      if(format==='json')assert.equal(JSON.parse(output.bytes.toString()).nodes.find(n=>n.id===textId).text,'Touch edit completed\nSecond line');
    }
    await closeModal();
  });
  await check('mobile MP4 export downloads an MP4 container or reports the browser capability limit', async () => {
    const supported=await page.evaluate(()=>typeof MediaRecorder!=='undefined'&&'captureStream' in HTMLCanvasElement.prototype&&['video/mp4;codecs=avc1.42E01E','video/mp4'].some(type=>MediaRecorder.isTypeSupported(type)));
    await more('export');await tap(page.locator('[data-format="mp4"]'));
    if(supported){
      const p=await project(),timeout=Math.min(60000,p.duration/p.fps*1000)+15000;
      const output=await downloadVia(()=>tap(page.locator('[data-action="download-export"]')),'mobile.mp4',timeout);
      assert.match(output.filename,/\.mp4$/);assert.ok(output.bytes.length>100);assert.ok(output.bytes.subarray(0,40).includes(Buffer.from('ftyp')));
      mp4Result='MP4 container downloaded through mobile export UI';
    }else{
      await tap(page.locator('[data-action="download-export"]'));
      await page.waitForFunction(()=>document.querySelector('#export-progress').textContent.includes('MP4 recording is unavailable'));
      assert.match(await page.locator('#export-progress').textContent(),/SVG\/GIF/);
      mp4Result='Unsupported browser: actionable error verified';
    }
    await closeModal();
  });
  await check('autosave preserves mobile edits and animation after reload', async () => {
    await page.waitForFunction(()=>document.querySelector('#save-status').textContent.includes('Saved on this device'));
    const before=await project(); await page.reload(); await page.waitForFunction(()=>window.RashStudio);
    assert.deepEqual(await project(),before); await page.screenshot({path:path.join(evidenceDir,'portrait.png'),fullPage:true});
  });
  await check('landscape retains an editable stage and visible touch controls', async () => {
    await page.setViewportSize({width:844,height:390}); await page.waitForTimeout(100);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    const stage=await page.locator('#stage').boundingBox(); assert.ok(stage.width>=100 && stage.height>=60,'Landscape stage remains usable');
    await selectLayer(textId); assert.ok(await button('Edit selected layer').isVisible());
    const deleteBox=await button('Delete selected layer').boundingBox(); assert.ok(deleteBox.y+deleteBox.height<=390,'Delete remains on screen');
  });
  await check('landscape touch inspector edits, deletes and restores a layer', async () => {
    await edit(); await tap(page.locator('#right-panel').getByRole('tab',{name:'Properties',exact:true})); await setProperty('X position',93); assert.equal((await node(textId)).x,93); await closeInspector();
    await tap(button('Delete selected layer')); assert.equal((await project()).nodes.length,1); await tap(button('Undo')); assert.equal((await project()).nodes.length,2);
    await page.screenshot({path:path.join(evidenceDir,'landscape.png'),fullPage:true});
  });
  await check('landscape wizard controls remain reachable and cancellation preserves work', async () => {
    const before=await project(); await tap(page.locator('.mobile-nav').getByRole('button',{name:'New',exact:true}));
    await tap(page.locator('[data-wizard-template="social"]')); await tap(page.locator('#modal').getByRole('button',{name:'Cancel',exact:true}));
    assert.deepEqual(await project(),before);
  });
  await check('no uncaught application errors during mobile editing workflows', async () => assert.deepEqual(errors,[]));
  console.log(`${checks.length} behavioral mobile acceptance checks passed`);
  await fs.writeFile(path.join(evidenceDir,'evidence.json'),JSON.stringify({url:base,browser:'Chromium',touchInput:true,viewports:[{width:390,height:844},{width:844,height:390}],checks,mp4Result,errors,limitations:['Physical iOS keyboard and Safari not covered by Chromium touch emulation.']},null,2));
} catch(error) {
  await page.screenshot({path:path.join(evidenceDir,'failure.png'),fullPage:true}).catch(()=>{});
  await fs.writeFile(path.join(evidenceDir,'evidence.json'),JSON.stringify({url:base,checks,failedCheck:currentCheck,error:error.message,errors},null,2));
  throw error;
} finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }

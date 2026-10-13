import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium,webkit} from 'playwright';

// Visible-control regressions can run under Chromium or WebKit. This test does
// not claim that WebKit headless validates the physical iPhone keyboard or CDP
// touch drag gestures. Those Chromium gestures live in mobile-browser.mjs.
const browserName=process.env.RASH_BROWSER || 'chromium';
assert.ok(['chromium','webkit'].includes(browserName),'RASH_BROWSER must be chromium or webkit');
const root=path.resolve('web');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.wasm':'application/wasm','.json':'application/json'};
const server=http.createServer(async(req,res)=>{
  try {
    let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));
    if(file===root) file=path.join(root,'index.html');
    if(!file.startsWith(root+path.sep)) throw Error('Outside web root');
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'}).end(await fs.readFile(file));
  } catch {res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=process.env.RASH_TEST_URL || `http://127.0.0.1:${server.address().port}/`;
const browser=await ({chromium,webkit}[browserName]).launch({headless:true,...(browserName==='chromium'?{args:['--no-sandbox']}: {})});
const page=await browser.newPage({viewport:{width:1600,height:1000},locale:'en-US',hasTouch:true});
page.setDefaultTimeout(8000);
const checks=[],errors=[];let active='boot',mobile;
const evidenceDir=path.resolve('test-results/workflows-'+browserName);await fs.mkdir(evidenceDir,{recursive:true});
page.on('pageerror',error=>errors.push(error.message));
const check=async(name,fn)=>{active=name;await fn();checks.push(name);console.log('PASS',name);};
const tap=locator=>locator.tap();
const project=()=>page.evaluate(()=>window.RashStudio.getProject());
const command=async name=>{await tap(page.getByRole('button',{name:'Open command palette',exact:true}));await page.getByLabel('Search commands',{exact:true}).fill(name);await tap(page.locator('#command-list button').first());};
const close=()=>tap(page.locator('#modal').getByRole('button',{name:'Close dialog',exact:true}));
const setInput=async(label,value)=>{const input=page.getByLabel(label,{exact:true});await tap(input);await input.fill(String(value));await page.locator('#right-panel .property-tabs').tap({position:{x:7,y:7}});};
async function newProject(template='blank'){
  await command('New composition');await tap(page.locator('[data-wizard-template="'+template+'"]'));await tap(page.locator('[data-wizard-preset="classic"]'));
  const replace=page.getByRole('checkbox',{name:/Replace the current composition/});if(await replace.count())await tap(replace);
  await tap(page.locator('[data-action="create-project"]'));
}
async function pathSize(id) {
  return page.evaluate(id=>{
    const stage=document.querySelector('#stage'),n=stage.querySelector('[data-node-id="'+id+'"]');
    const r=n.getBoundingClientRect(),s=stage.getBoundingClientRect(),p=window.RashStudio.getProject();
    return {width:r.width/s.width*p.width,height:r.height/s.height*p.height};
  },id);
}
try{
  await page.goto(base);await page.waitForFunction(()=>window.RashStudio);await page.waitForFunction(()=>document.querySelector('#engine-status').textContent.includes('Rust'));
  let rectId,pathId;
  await check('FPS changes preserve keyframe wall time in inspector and toolbar',async()=>{
    await newProject();await command('Add rectangle');rectId=(await project()).nodes[0].id;
    await tap(page.getByRole('tab',{name:'Motion',exact:true}));await setInput('Current frame',1);await tap(page.getByRole('button',{name:'Add keyframe here',exact:true}));
    await setInput('Current frame',31);await tap(page.getByRole('button',{name:'Add keyframe here',exact:true}));
    const fpsInput=page.getByLabel('Playback frames per second',{exact:true});await tap(fpsInput);await fpsInput.fill('');await fpsInput.pressSequentially('60');assert.equal(await fpsInput.inputValue(),'60');assert.equal((await project()).fps,60,'Typing must update the document without waiting for blur');await page.locator('#right-panel .property-tabs').tap({position:{x:7,y:7}});
    let p=await project();assert.equal(p.fps,60);assert.equal(p.duration,480);assert.deepEqual(p.nodes[0].keyframes.map(k=>k.frame),[0,60]);
    await page.getByLabel('Frames per second',{exact:true}).selectOption('24');
    p=await project();assert.equal(p.fps,24);assert.equal(p.duration,192);assert.deepEqual(p.nodes[0].keyframes.map(k=>k.frame),[0,24]);await command('Undo');assert.equal((await project()).fps,60);await command('Undo');assert.equal((await project()).fps,30);assert.deepEqual((await project()).nodes[0].keyframes.map(k=>k.frame),[0,30]);await command('Redo');assert.equal((await project()).fps,60);await command('Redo');assert.equal((await project()).fps,24);
  });
  await check('reusing synchronized FPS, frame, easing and stroke controls commits the visible value',async()=>{
    const toolbarFPS=page.getByLabel('Frames per second',{exact:true});
    await toolbarFPS.selectOption('60');assert.equal((await project()).fps,60);
    await setInput('Playback frames per second',30);assert.equal((await project()).fps,30);assert.equal(await toolbarFPS.inputValue(),'30');
    await toolbarFPS.selectOption('60');assert.equal((await project()).fps,60,'Returning to a previously chosen toolbar value must update the project');
    await tap(page.getByRole('button',{name:'Go to keyframe 61',exact:true}));assert.equal(await page.evaluate(()=>window.RashStudio.getFrame()),60,'Retimed keyframe chips must seek the actual new frame');assert.equal(await page.getByLabel('Current frame',{exact:true}).getAttribute('max'),'480');
    await setInput('Current frame',31);assert.equal(await page.evaluate(()=>window.RashStudio.getFrame()),30);
    await setInput('Playback frames per second',30);assert.equal(await page.getByLabel('Current frame',{exact:true}).inputValue(),'16');
    await setInput('Current frame',31);assert.equal(await page.evaluate(()=>window.RashStudio.getFrame()),30,'A previously typed frame must work after FPS retimes the playhead');
    await page.getByLabel('Keyframe easing',{exact:true}).selectOption('easeOut');
    await setInput('Current frame',1);await page.getByLabel('Keyframe easing',{exact:true}).selectOption('easeIn');
    await setInput('Current frame',31);assert.equal(await page.getByLabel('Keyframe easing',{exact:true}).inputValue(),'easeOut');
    await page.getByLabel('Keyframe easing',{exact:true}).selectOption('easeIn');assert.equal((await project()).nodes[0].keyframes.find(k=>k.frame===30).easing,'easeIn','The same easing value must apply to a different keyframe');
    await tap(page.getByRole('tab',{name:'Properties',exact:true}));await setInput('Stroke width',0);
    await page.getByLabel('Stroke color',{exact:true}).fill('#4488ff');assert.equal((await project()).nodes[0].strokeWidth,1);assert.equal(await page.getByLabel('Stroke width',{exact:true}).inputValue(),'1');
    await setInput('Stroke width',0);assert.equal((await project()).nodes[0].strokeWidth,0,'Autoenabled stroke width must remain editable back to its previous value');
  });
  await check('frame operations insert, remove and copy time with undo',async()=>{
    await newProject();await command('Add rectangle');
    await tap(page.getByRole('tab',{name:'Motion',exact:true}));await setInput('Current frame',1);await tap(page.getByRole('button',{name:'Add keyframe here',exact:true}));
    await setInput('Current frame',11);await tap(page.getByRole('button',{name:'Add keyframe here',exact:true}));await tap(page.getByRole('tab',{name:'Properties',exact:true}));await setInput('X position',320);
    await page.evaluate(()=>window.RashStudio.seek(5));await command('Frame operations');await page.locator('#frame-operation-count').fill('3');await tap(page.getByRole('button',{name:'Insert frames',exact:true}));
    let p=await project();assert.equal(p.duration,243);assert.deepEqual(p.nodes[0].keyframes.map(key=>key.frame),[0,13]);
    await command('Undo');p=await project();assert.equal(p.duration,240);assert.deepEqual(p.nodes[0].keyframes.map(key=>key.frame),[0,10]);
    await command('Redo');p=await project();assert.equal(p.duration,243);assert.deepEqual(p.nodes[0].keyframes.map(key=>key.frame),[0,13]);
    await page.evaluate(()=>window.RashStudio.seek(5));await command('Frame operations');await page.locator('#frame-operation-count').fill('2');await tap(page.getByRole('button',{name:'Remove frames',exact:true}));
    p=await project();assert.equal(p.duration,241);assert.deepEqual(p.nodes[0].keyframes.map(key=>key.frame),[0,11]);
    await command('Undo');p=await project();assert.equal(p.duration,243);assert.deepEqual(p.nodes[0].keyframes.map(key=>key.frame),[0,13]);
    await page.evaluate(()=>window.RashStudio.seek(13));await command('Frame operations');await page.locator('#copy-frame-destination').fill('20');await tap(page.getByRole('button',{name:'Copy pose',exact:true}));
    p=await project();assert.equal(p.nodes[0].keyframes.find(key=>key.frame===19).x,320);await command('Undo');assert.deepEqual((await project()).nodes[0].keyframes.map(key=>key.frame),[0,13]);
    await page.evaluate(()=>window.RashStudio.seek(20));await command('Frame operations');await tap(page.getByRole('button',{name:'Blank keyframe',exact:true}));
    p=await project();assert.equal(p.nodes[0].keyframes.find(key=>key.frame===20).blank,true);assert.equal(await page.locator('#stage > g[data-node-id]').getAttribute('display'),'none');
    await command('Frame operations');await tap(page.getByRole('button',{name:'Expose layer',exact:true}));p=await project();assert.equal(p.nodes[0].keyframes.find(key=>key.frame===20).blank,false);assert.equal(await page.locator('#stage > g[data-node-id]').getAttribute('display'),'inline');
    await command('Undo');assert.equal((await project()).nodes[0].keyframes.find(key=>key.frame===20).blank,true);await command('Redo');assert.equal((await project()).nodes[0].keyframes.find(key=>key.frame===20).blank,false);
    await command('Create graphic symbol');await page.getByLabel('Symbol name',{exact:true}).fill('Frame scope');await tap(page.getByRole('button',{name:'Create symbol',exact:true}));const scopeId=await page.evaluate(()=>window.RashStudio.getEditingScope());
    await command('Add rectangle');await page.evaluate(()=>window.RashStudio.seek(4));await command('Frame operations');await page.locator('#frame-operation-count').fill('2');await tap(page.getByRole('button',{name:'Insert frames',exact:true}));
    p=await project();assert.equal(p.symbols.find(symbol=>symbol.id===scopeId).duration,245);assert.equal(p.duration,243);await command('Undo');assert.equal((await project()).symbols.find(symbol=>symbol.id===scopeId).duration,243);await tap(page.getByRole('button',{name:'Back to Scene',exact:true}));
  });
  await check('frame labels author, seek, rename, retime and undo',async()=>{
    await newProject();await page.evaluate(()=>window.RashStudio.seek(12));await command('Frame operations');await page.locator('#frame-label-name').fill('Intro');await tap(page.getByRole('button',{name:'Add label',exact:true}));
    let p=await project();assert.deepEqual(p.frameLabels,[{frame:12,name:'Intro'}]);assert.equal(await page.locator('[data-frame-label="12"]').count(),1);
    await page.evaluate(()=>window.RashStudio.seek(0));await tap(page.locator('[data-frame-label="12"]'));assert.equal(await page.evaluate(()=>window.RashStudio.getFrame()),12);
    await command('Frame operations');await page.locator('#frame-label-name').fill('Opening');await tap(page.getByRole('button',{name:'Rename label',exact:true}));assert.deepEqual((await project()).frameLabels,[{frame:12,name:'Opening'}]);
    await page.getByLabel('Frames per second',{exact:true}).selectOption('60');p=await project();assert.equal(p.fps,60);assert.deepEqual(p.frameLabels,[{frame:24,name:'Opening'}]);await command('Undo');p=await project();assert.equal(p.fps,30);assert.deepEqual(p.frameLabels,[{frame:12,name:'Opening'}]);
    await page.evaluate(()=>window.RashStudio.seek(5));await command('Frame operations');await page.locator('#frame-operation-count').fill('3');await tap(page.getByRole('button',{name:'Insert frames',exact:true}));assert.deepEqual((await project()).frameLabels,[{frame:15,name:'Opening'}]);
    await command('Undo');assert.deepEqual((await project()).frameLabels,[{frame:12,name:'Opening'}]);await page.evaluate(()=>window.RashStudio.seek(12));await command('Frame operations');await tap(page.getByRole('button',{name:'Remove label',exact:true}));assert.deepEqual((await project()).frameLabels,[]);await command('Undo');assert.deepEqual((await project()).frameLabels,[{frame:12,name:'Opening'}]);
  });
  await check('path width and height edits resize rendered geometry',async()=>{
    await newProject();await tap(page.getByRole('tab',{name:'Library',exact:true}));await tap(page.getByRole('button',{name:'Add Curve',exact:true}));
    pathId=(await project()).nodes[0].id;await tap(page.getByRole('tab',{name:'Properties',exact:true}));
    const before=await pathSize(pathId),node=(await project()).nodes[0];
    await setInput('Width',node.width*2);await setInput('Height',node.height*2);
    const after=await pathSize(pathId);assert.ok(Math.abs(after.width/before.width-2)<0.02);assert.ok(Math.abs(after.height/before.height-2)<0.02);
  });
  await check('resizing a composition scales actual path geometry consistently',async()=>{
    const before=await pathSize(pathId);await command('Resize composition');
    await page.getByLabel('WIDTH',{exact:true}).fill('1100');await page.getByLabel('HEIGHT',{exact:true}).fill('800');await tap(page.locator('[data-action="confirm-resize"]'));
    const p=await project(),after=await pathSize(pathId);assert.equal(p.width,1100);assert.equal(p.height,800);
    assert.ok(Math.abs(after.width/before.width-2)<0.02);assert.ok(Math.abs(after.height/before.height-2)<0.02);
  });
  await check('oversized multiline edits report an error without replacing the valid scene',async()=>{
    await newProject();await command('Add text');const before=await project();
    await tap(page.getByRole('button',{name:'Edit text content',exact:true}));await page.locator('#edit-text-input').fill('\n'.repeat(300));
    await tap(page.getByRole('button',{name:'Apply text',exact:true}));assert.deepEqual(await project(),before);
    assert.match(await page.locator('#text-error').textContent(),/at most 256 lines/);assert.ok(await page.locator('#edit-text-input').isVisible());await close();
  });
  await check('script commands validate before any goto can render rejected multiline content',async()=>{
    const before=await project(),id=before.nodes[0].id;
    await command('Actions script editor');
    await page.evaluate(()=>{window.__rashAddedLines=0;window.__rashLineObserver=new MutationObserver(records=>{for(const record of records){window.__rashAddedLines=Math.max(window.__rashAddedLines,[...record.addedNodes].filter(n=>n.nodeName.toLowerCase()==='tspan').length);}});window.__rashLineObserver.observe(document.querySelector('#stage'),{childList:true,subtree:true});});
    await page.getByLabel('ActionScript editor',{exact:true}).fill(`getNode(${JSON.stringify(id)}).text = ${JSON.stringify('\n'.repeat(300))}; gotoAndStop(1);`);
    await tap(page.getByRole('button',{name:'Run script',exact:true}));await page.waitForFunction(()=>document.querySelector('#script-output').textContent.includes('at most 256 lines'));
    assert.deepEqual((await project()).nodes,before.nodes);assert.ok(await page.evaluate(()=>window.__rashAddedLines<=256));
    await page.evaluate(()=>window.__rashLineObserver.disconnect());await close();
  });
  await check('closing a running game preview restores the authored scene',async()=>{
    await newProject('game');const before=await project(),player=before.nodes.find(n=>n.name==='player');
    await tap(page.locator('.preview-button'));const avatar=page.locator('#preview-stage [data-node-id="'+player.id+'"]');const initial=await avatar.getAttribute('transform');
    await page.keyboard.down('ArrowRight');try{await page.waitForFunction(({id,initial})=>document.querySelector('#preview-stage [data-node-id="'+id+'"]').getAttribute('transform')!==initial,{id:player.id,initial},{timeout:5000});}finally{await page.keyboard.up('ArrowRight');}assert.notEqual(await avatar.getAttribute('transform'),initial,'Preview game must really move');
    await close();assert.deepEqual(await project(),before,'Closing preview must not retain game state in authoring data');
  });
  await check('Actions close persists source with no previous save timer pending',async()=>{
    await page.waitForFunction(()=>document.querySelector('#save-status').textContent.includes('Saved on this device'));
    await command('Actions script editor');await page.getByLabel('ActionScript editor',{exact:true}).fill('trace("closed without running");');await close();
    await page.waitForFunction(()=>document.querySelector('#save-status').textContent.includes('Saved on this device'));
    await page.reload();await page.waitForFunction(()=>window.RashStudio);assert.equal((await project()).script,'trace("closed without running");');
  });
  await check('touch phone workflow creates, edits and renames an actual layer',async()=>{
    mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'en-US'});mobile.setDefaultTimeout(8000);mobile.on('pageerror',error=>errors.push(error.message));
    await mobile.goto(base);await mobile.waitForFunction(()=>window.RashStudio);
    await tap(mobile.locator('.mobile-nav').getByRole('button',{name:'New',exact:true}));await tap(mobile.locator('[data-wizard-template="blank"]'));await tap(mobile.locator('[data-action="create-project"]'));
    await tap(mobile.locator('.mobile-nav').getByRole('button',{name:'Draw',exact:true}));await tap(mobile.locator('#modal').getByRole('button',{name:'Rectangle',exact:true}));
    const stage=await mobile.locator('#stage').boundingBox();await mobile.touchscreen.tap(stage.x+stage.width*.2,stage.y+stage.height*.2);
    assert.equal(await mobile.evaluate(()=>window.RashStudio.getProject().nodes.length),1);
    await tap(mobile.getByRole('button',{name:'Edit selected layer',exact:true}));const x=mobile.getByLabel('X position',{exact:true});await tap(x);await x.fill('47');await mobile.locator('#right-panel .property-tabs').tap({position:{x:7,y:7}});
    assert.equal(await mobile.evaluate(()=>window.RashStudio.getProject().nodes[0].x),47);
    await tap(mobile.locator('#inspector [data-action="rename-layer"]'));await mobile.getByLabel('LAYER NAME',{exact:true}).fill('Phone edited');await tap(mobile.getByRole('button',{name:'Save name',exact:true}));
    assert.equal(await mobile.evaluate(()=>window.RashStudio.getProject().nodes[0].name),'Phone edited');if(await mobile.getByRole('button',{name:'Close inspector',exact:true}).isVisible())await tap(mobile.getByRole('button',{name:'Close inspector',exact:true}));
  });
  await check('touch phone delete, undo and redo change the authored project',async()=>{
    await tap(mobile.getByRole('button',{name:'Delete selected layer',exact:true}));assert.equal(await mobile.evaluate(()=>window.RashStudio.getProject().nodes.length),0);
    await tap(mobile.getByRole('button',{name:'Undo',exact:true}));assert.equal(await mobile.evaluate(()=>window.RashStudio.getProject().nodes.length),1);
    await tap(mobile.getByRole('button',{name:'Redo',exact:true}));assert.equal(await mobile.evaluate(()=>window.RashStudio.getProject().nodes.length),0);
    await tap(mobile.getByRole('button',{name:'Undo',exact:true}));assert.equal(await mobile.evaluate(()=>window.RashStudio.getProject().nodes.length),1);
  });
  await check('touch phone edits survive reload',async()=>{
    await mobile.waitForFunction(()=>document.querySelector('#save-status').textContent.includes('Saved on this device'));
    await mobile.reload();await mobile.waitForFunction(()=>window.RashStudio);const n=await mobile.evaluate(()=>window.RashStudio.getProject().nodes[0]);assert.equal(n.name,'Phone edited');assert.equal(n.x,47);
    await mobile.screenshot({path:path.join(evidenceDir,'phone.png'),fullPage:true});
  });
  await check('touch phone exposes frame insertion with undo',async()=>{
    await tap(mobile.locator('.mobile-nav').getByRole('button',{name:'Layers',exact:true}));await tap(mobile.locator('[data-layer]').first());
    await mobile.evaluate(()=>window.RashStudio.seek(4));await tap(mobile.locator('.mobile-nav').getByRole('button',{name:'More',exact:true}));await tap(mobile.locator('#modal').getByRole('button',{name:'Frame operations',exact:true}));
    await mobile.locator('#frame-operation-count').fill('1');await tap(mobile.getByRole('button',{name:'Insert frames',exact:true}));assert.equal(await mobile.evaluate(()=>window.RashStudio.getProject().duration),241);
    await tap(mobile.getByRole('button',{name:'Undo',exact:true}));assert.equal(await mobile.evaluate(()=>window.RashStudio.getProject().duration),240);
    await mobile.evaluate(()=>window.RashStudio.seek(8));await tap(mobile.locator('.mobile-nav').getByRole('button',{name:'More',exact:true}));await tap(mobile.locator('#modal').getByRole('button',{name:'Frame operations',exact:true}));await mobile.locator('#frame-label-name').fill('Phone cue');await tap(mobile.getByRole('button',{name:'Add label',exact:true}));assert.deepEqual(await mobile.evaluate(()=>window.RashStudio.getProject().frameLabels),[{frame:8,name:'Phone cue'}]);
  });
  await check('no uncaught errors in workflow regression tests',async()=>assert.deepEqual(errors,[]));
  await fs.writeFile(path.join(evidenceDir,'evidence.json'),JSON.stringify({url:base,browser:browserName,checks,errors,phone:{width:390,height:844,touch:true},limitations:['No physical iOS keyboard coverage.','Touch drag and resizing gestures are covered separately in Chromium only.']},null,2));
  console.log(`${checks.length} ${browserName} workflow checks passed`);
}catch(error){
  await (mobile||page).screenshot({path:path.join(evidenceDir,'failure.png'),fullPage:true}).catch(()=>{});
  await fs.writeFile(path.join(evidenceDir,'evidence.json'),JSON.stringify({url:base,browser:browserName,checks,failedCheck:active,error:error.message,errors},null,2));throw error;
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}

import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium,webkit} from 'playwright';
import {createProject,normalizeNode,validateProject} from '../web/core/model.js';

const name=process.env.RASH_BROWSER||'chromium',root=path.resolve('web');
const files=new Map(),types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.wasm':'application/wasm','.svg':'image/svg+xml','.json':'application/json'};
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://local');
 if(files.has(url.pathname)){res.writeHead(200,{'Content-Type':types[path.extname(url.pathname)]}).end(files.get(url.pathname));return;}
 if(url.pathname==='/host.html'){res.writeHead(200,{'Content-Type':'text/html'}).end('<!doctype html><title>Independent symbol host</title><body>');return;}
 let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(file===root)file=path.join(root,'index.html');if(!file.startsWith(root+path.sep))throw Error();
 res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Access-Control-Allow-Origin':'*'}).end(await fs.readFile(file));
}catch{res.writeHead(404).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const local=`http://127.0.0.1:${server.address().port}/`,base=process.env.RASH_TEST_URL||local;
const output=path.resolve('test-results/symbols-'+name);await fs.mkdir(output,{recursive:true});
const checks=[],errors=[],pass=async(label,fn)=>{active=label;await fn();checks.push(label);console.log('PASS',label);};
let browser,page,phone,active='boot',shared,first,second,inner,authored;
const read=(p=page)=>p.evaluate(()=>window.RashStudio.getProject());
const tap=l=>l.tap();
const field=async(label,value,p=page)=>{const el=p.getByLabel(label,{exact:true});await tap(el);await el.fill(String(value));await el.blur();};
const command=async(label,p=page)=>{await tap(p.getByRole('button',{name:'Open command palette',exact:true}));await p.getByLabel('Search commands',{exact:true}).fill(label);await tap(p.locator('#command-list button').first());};
const scope=(p=page)=>p.evaluate(()=>window.RashStudio.getEditingScope());
const select=async(id,p=page)=>{if(await p.locator('#layers-panel').isHidden())await tap(p.locator('[data-panel="layers"]'));await tap(p.locator(`#layer-list [data-layer="${id}"]`));};
const library=async(p=page)=>{await command('Symbol library',p);};
const row=(id,action,p=page)=>p.locator(`[data-symbol-action="${action}"][data-symbol-id="${id}"]`);
const importProject=async(project,p=page)=>{await p.locator('#project-import').setInputFiles({name:'symbol-fixture.rash.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});await p.waitForFunction(expected=>JSON.stringify(window.RashStudio.getProject())===expected,JSON.stringify(project));};
const convert=async(label,p=page)=>{await command('Convert layer to symbol',p);await p.getByLabel('Symbol name',{exact:true}).fill(label);await tap(p.locator('[data-action="confirm-symbol"]'));};
const download=async(action,p=page)=>{const pending=p.waitForEvent('download');await action();return fs.readFile(await(await pending).path());};
const position=async(p,selector,svg='#stage')=>p.locator(selector).evaluate((el,svg)=>{const root=document.querySelector(svg),m=root.getScreenCTM().inverse().multiply(el.getScreenCTM());return {x:m.e,y:m.f,a:m.a,d:m.d};},svg);
function seed(){const p=createProject('blank','classic');p.id='symbol-ui-fixture';p.name='Symbol acceptance';p.duration=60;p.script='';p.nodes=[normalizeNode({id:'actor',name:'Actor',type:'rect',x:40,y:80,width:60,height:40,rx:0,fill:'#ff7954',keyframes:[{frame:0,x:40,easing:'linear'},{frame:30,x:140,easing:'linear'},{frame:59,x:40,easing:'linear'}]})];return validateProject(p);}
function nestedFixture(){
 const p=seed();p.id='nested-clock-fixture';p.version=2;p.background='#000000';
 p.symbols=[
  {id:'inner',name:'Inner',width:120,height:60,duration:20,nodes:[{id:'leaf',type:'rect',width:20,height:20,x:5,y:10,fill:'#00ff00',blur:1,maskType:'rect',maskWidth:10,maskHeight:20,keyframes:[{frame:19,x:65,easing:'linear'}]}]},
  {id:'outer',name:'Outer',width:200,height:100,duration:40,nodes:[{id:'child',type:'symbol',symbolId:'inner',x:20,y:10,width:120,height:60,playback:'once',firstFrame:5,startFrame:3}]}
 ];
 p.nodes=[{id:'left',type:'symbol',symbolId:'outer',x:50,y:60,width:200,height:100,playback:'loop',firstFrame:2,startFrame:4},{id:'right',type:'symbol',symbolId:'outer',x:300,y:220,width:160,height:80,playback:'single',firstFrame:9}];
 return validateProject(p);
}
function movieclipFixture(){
 const p=createProject('blank','classic');p.id='movieclip-clock-fixture';p.name='MovieClip clock';p.version=2;p.duration=2;p.fps=10;p.script='';
 p.symbols=[{id:'clip',name:'Clip',width:40,height:20,duration:3,nodes:[{id:'leaf',type:'rect',width:10,height:10,x:0,y:0,fill:'#00ff00',keyframes:[{frame:2,x:20,easing:'linear'}]}]}];
 p.nodes=[{id:'instance',type:'symbol',symbolId:'clip',width:40,height:20,playback:'movieclip'}];return validateProject(p);
}
try{
 browser=await({chromium,webkit}[name]).launch({headless:true,...(name==='chromium'?{args:['--no-sandbox']}: {})});
 page=await browser.newPage({viewport:{width:1600,height:1000},hasTouch:true});page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.waitForFunction(()=>window.RashStudio);
 await pass('convert animated artwork without changing its scene geometry or source timing',async()=>{
  await importProject(seed());await select('actor');const before=await read();await convert('Pulse');const p=await read();assert.equal(p.version,2);assert.equal(p.symbols.length,1);shared=p.symbols[0].id;first=p.nodes[0].id;
  assert.ok(await page.getByLabel('Blur',{exact:true}).isDisabled());assert.ok(await page.getByLabel('Glow',{exact:true}).isDisabled());assert.ok(await page.locator('[data-property="blendMode"]').isEnabled());
  await command('Motion presets');assert.equal(await page.locator('[data-motion-preset="blurReveal"]').count(),0);await tap(page.locator('#modal').getByRole('button',{name:'Close dialog',exact:true}));
  assert.equal(p.nodes[0].symbolId,shared);assert.equal(p.symbols[0].nodes[0].keyframes.length,3);assert.equal(p.symbols[0].nodes[0].keyframes[1].x,100);
  for(const [frame,x]of [[0,40],[30,140],[59,40]]){await page.evaluate(f=>window.RashStudio.seek(f),frame);const actual=await position(page,`#stage [data-instance-path="${first}/actor"]`);assert.ok(Math.abs(actual.x-x)<.01);assert.ok(Math.abs(actual.y-80)<.01);}
  await command('Undo');assert.deepEqual(await read(),before);await command('Redo');assert.equal((await read()).symbols[0].id,shared);await page.evaluate(()=>window.RashStudio.seek(0));
 });
 await pass('library instances, Duplicate and Undo preserve shared identity',async()=>{
  await library();await tap(row(shared,'place'));let p=await read();second=p.nodes.at(-1).id;assert.equal(p.nodes.length,2);assert.equal(p.nodes[1].symbolId,shared);await field('X position',300);await field('Y position',180);
  const before=await read();await tap(page.locator('#inspector [data-action="duplicate"]'));p=await read();assert.equal(p.nodes.length,3);assert.equal(p.symbols.length,1);assert.equal(p.nodes.at(-1).symbolId,shared);await command('Undo');assert.deepEqual(await read(),before);
 });
 await pass('shared definition editing changes every instance and keeps its own timeline',async()=>{
  await select(first);await tap(page.locator('#inspector [data-action="edit-symbol"]'));assert.equal(await scope(),shared);assert.equal(await page.locator('#scope-name').textContent(),'Pulse');
  await field('Duration in seconds',1);assert.equal((await read()).duration,60);assert.equal((await read()).symbols[0].duration,30);
  await select('actor');await page.getByLabel('Fill color',{exact:true}).fill('#00ff00');await page.getByLabel('Fill color',{exact:true}).blur();assert.equal((await read()).symbols[0].nodes[0].fill,'#00ff00');
  await page.screenshot({path:path.join(output,'definition-desktop.png'),fullPage:true});
  await tap(page.getByRole('button',{name:'Back to Scene',exact:true}));assert.equal(await scope(),null);assert.equal(await page.locator('#stage [data-symbol-node-id="actor"] > rect[fill="#00ff00"]').count(),2);
 });
 await pass('instance clocks, offsets and timing controls survive exact Undo',async()=>{
  await select(second);const before=await read();await page.getByLabel('Symbol playback',{exact:true}).selectOption('single');await field('First symbol frame',11);await field('Start on parent frame',6);
  let n=(await read()).nodes.find(n=>n.id===second);assert.equal(n.playback,'single');assert.equal(n.firstFrame,10);assert.equal(n.startFrame,5);
  await page.evaluate(()=>window.RashStudio.seek(20));const held=await position(page,`#stage [data-instance-path="${second}/actor"]`);await page.evaluate(()=>window.RashStudio.seek(50));assert.deepEqual(await position(page,`#stage [data-instance-path="${second}/actor"]`),held);
  await command('Undo');await command('Undo');await command('Undo');assert.deepEqual(await read(),before);
  await page.getByLabel('Symbol playback',{exact:true}).selectOption('movieclip');assert.equal((await read()).nodes.find(n=>n.id===second).playback,'movieclip');assert.match(await page.locator('.symbol-properties').textContent(),/independent preview transport/);
  const phase=await position(page,`#stage [data-instance-path="${second}/actor"]`);await tap(page.locator('[data-inspector="motion"]'));const fps=page.getByLabel('Playback frames per second',{exact:true});await tap(fps);await fps.fill('6');assert.ok(Math.abs((await position(page,`#stage [data-instance-path="${second}/actor"]`)).x-phase.x)<.01);await fps.fill('60');assert.ok(Math.abs((await position(page,`#stage [data-instance-path="${second}/actor"]`)).x-phase.x)<.01);await fps.blur();
  await command('Undo');await command('Undo');assert.deepEqual(await read(),before);await tap(page.locator('[data-inspector="properties"]'));await page.evaluate(()=>window.RashStudio.seek(0));
 });
 await pass('nested conversion, cycle guard and root document download while scoped',async()=>{
  await select(first);await tap(page.locator('#inspector [data-action="edit-symbol"]'));await select('actor');await convert('Inner');let p=await read();inner=p.symbols.find(s=>s.name==='Inner').id;assert.equal(p.symbols.length,2);assert.equal(p.nodes.length,2);assert.equal(p.symbols.find(s=>s.id===shared).nodes[0].symbolId,inner);
  await library();assert.equal(await row(shared,'place').isDisabled(),true);await tap(row(inner,'edit'));assert.equal(await scope(),inner);await library();assert.equal(await row(shared,'place').isDisabled(),true);assert.equal(await row(inner,'place').isDisabled(),true);
  const before=await read();const bytes=await download(()=>command('Save project'));assert.deepEqual(JSON.parse(bytes.toString()),before);
  await page.waitForFunction(expected=>JSON.stringify(JSON.parse(localStorage.getItem('rash-studio-project-v1')))===expected,JSON.stringify(before));await page.reload();await page.waitForFunction(()=>window.RashStudio);assert.deepEqual(await read(),before);assert.equal(await scope(),null);authored=before;
 });
 await pass('referenced definitions reject deletion and unused definitions delete with Undo',async()=>{
  await library();const before=await read();await tap(row(shared,'delete'));assert.deepEqual(await read(),before);assert.match(await page.locator('#toast').textContent(),/in use/);
  await tap(page.locator('[data-action="new-symbol"]').filter({visible:true}).first());await page.getByLabel('Symbol name',{exact:true}).fill('Unused');await tap(page.locator('[data-action="confirm-symbol"]'));const id=await scope();await tap(page.getByRole('button',{name:'Back to Scene',exact:true}));await library();const withUnused=await read();await tap(row(id,'delete'));assert.ok(!(await read()).symbols.some(s=>s.id===id));await command('Undo');assert.deepEqual(await read(),withUnused);await importProject(authored);
 });
 await pass('phone converts, edits, nests, returns to Scene, deletes and undoes by touch',async()=>{
  phone=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});phone.setDefaultTimeout(10000);phone.on('pageerror',e=>errors.push(e.message));await phone.goto(base);await phone.waitForFunction(()=>window.RashStudio);await importProject(seed(),phone);
  await tap(phone.locator('.mobile-nav').getByRole('button',{name:'Layers',exact:true}));await select('actor',phone);
  await tap(phone.locator('.mobile-nav').getByRole('button',{name:'More',exact:true}));await tap(phone.locator('#modal [data-action="convert-symbol"]'));await phone.getByLabel('Symbol name',{exact:true}).fill('Touch symbol');await tap(phone.locator('[data-action="confirm-symbol"]'));const id=(await read(phone)).symbols[0].id;
  await tap(phone.locator('#inspector [data-action="edit-symbol"]'));assert.equal(await scope(phone),id);await tap(phone.locator('.mobile-nav').getByRole('button',{name:'Layers',exact:true}));await select('actor',phone);await tap(phone.getByRole('button',{name:'Edit selected layer',exact:true}));await field('Width',72,phone);assert.equal((await read(phone)).symbols[0].nodes[0].width,72);await tap(phone.locator('#inspector [data-action="convert-symbol"]'));await phone.getByLabel('Symbol name',{exact:true}).fill('Touch inner');await tap(phone.locator('[data-action="confirm-symbol"]'));assert.equal((await read(phone)).symbols.length,2);
  await phone.screenshot({path:path.join(output,'definition-phone.png'),fullPage:true});
  await tap(phone.getByRole('button',{name:'Close inspector',exact:true}));await tap(phone.getByRole('button',{name:'Back to Scene',exact:true}));assert.equal(await scope(phone),null);const before=await read(phone);await tap(phone.getByRole('button',{name:'Delete selected layer',exact:true}));assert.equal((await read(phone)).nodes.length,0);await tap(phone.locator('#selection-toolbar').getByRole('button',{name:'Undo',exact:true}));assert.deepEqual(await read(phone),before);
  assert.ok(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await phone.screenshot({path:path.join(output,'phone.png'),fullPage:true});
 });
 await pass('editor MovieClip transport survives root loops, pause and a non-seeking script',async()=>{
  await importProject(movieclipFixture());const selector='#stage [data-instance-path="instance/leaf"]',initial=await page.locator(selector).getAttribute('transform');await tap(page.getByRole('button',{name:'Play animation',exact:true}));
  await page.waitForFunction(({selector,initial})=>document.querySelector(selector)?.getAttribute('transform')!==initial&&document.querySelector('#frame-status')?.textContent.includes('Frame 1 of 2'),{selector,initial});await tap(page.getByRole('button',{name:'Pause animation',exact:true}));const phase=await page.locator(selector).getAttribute('transform');await page.waitForTimeout(180);assert.equal(await page.locator(selector).getAttribute('transform'),phase);
  await command('Actions');await page.getByLabel('ActionScript editor',{exact:true}).fill('trace("noop");');await tap(page.getByRole('button',{name:'Run script',exact:true}));await page.waitForFunction(()=>document.querySelector('#script-output')?.textContent.includes('noop'));assert.equal(await page.locator('#stage [data-instance-path="instance/leaf"]').getAttribute('transform'),phase);await tap(page.locator('#modal').getByRole('button',{name:'Close dialog',exact:true}));
  await command('Export composition');await tap(page.locator('[data-format="svg"]'));const bytes=await download(()=>tap(page.locator('[data-action="download-export"]')));files.set('/movieclip-export.svg',bytes);await tap(page.locator('#modal').getByRole('button',{name:'Close dialog',exact:true}));const exported=await browser.newPage({viewport:{width:200,height:120}});await exported.goto(local+'movieclip-export.svg');
  const sample=async time=>{await exported.evaluate(value=>{document.documentElement.pauseAnimations();document.documentElement.setCurrentTime(value);},time);await exported.waitForTimeout(40);return position(exported,'[data-instance-path="instance/leaf"] rect','svg');},at0=await sample(.0001),at2=await sample(.2001),at6=await sample(.6001);assert.ok(Math.abs(at2.x-at0.x)>15);assert.ok(Math.abs(at6.x-at0.x)<.01,'The six-frame common cycle must close exactly');await exported.close();
 });
 await pass('nested live, still and animated SVG geometry agree at several parent frames',async()=>{
  const fixture=nestedFixture();await importProject(fixture);await command('Export composition');await tap(page.locator('[data-format="svg"]'));const bytes=await download(()=>tap(page.locator('[data-action="download-export"]')));files.set('/symbol-export.svg',bytes);await tap(page.locator('#modal').getByRole('button',{name:'Close dialog',exact:true}));
  const exported=await browser.newPage({viewport:{width:550,height:400}});await exported.goto(local+'symbol-export.svg');assert.equal(await exported.locator('parsererror').count(),0);
  for(const frame of [0,10,25,45]){
   await page.evaluate(f=>window.RashStudio.seek(f),frame);const live=await position(page,'#stage [data-instance-path="left/child/leaf"]');const outer=(Math.max(0,frame-4)+2)%40,child=Math.min(19,Math.max(0,outer-3)+5),expectedX=50+20+5+60*child/19;
   assert.ok(Math.abs(live.x-expectedX)<.01,`${frame}: ${live.x} vs ${expectedX}`);
   // SMIL stores seek times with limited precision. Sample 100 microseconds inside
   // the authored frame so browser truncation cannot seek into the previous frame.
   await exported.evaluate(t=>{document.documentElement.pauseAnimations();document.documentElement.setCurrentTime(t);},frame/30+0.0001);await exported.waitForTimeout(60);
   // Compare leaf shapes directly: exported transforms live in wrappers inside the identity group.
   const exact=await position(exported,'[data-instance-path="left/child/leaf"] rect','svg');assert.ok(Math.abs(exact.x-live.x)<.02,`frame ${frame}: animated ${JSON.stringify(exact)} live ${JSON.stringify(live)}`);assert.ok(Math.abs(exact.y-live.y)<.02);
   const svg=await page.evaluate(async f=>{const {sceneToSVG}=await import('./core/renderer.js');return sceneToSVG(window.RashStudio.getProject(),f);},frame);files.set('/symbol-still.svg',svg);const still=await browser.newPage({viewport:{width:550,height:400}});await still.goto(local+'symbol-still.svg');const stillPos=await position(still,'[data-instance-path="left/child/leaf"] rect','svg');assert.ok(Math.abs(stillPos.x-live.x)<.02);await still.close();
  }
  const ids=await page.locator('#stage defs [id]').evaluateAll(es=>es.map(e=>e.id));assert.equal(ids.length,new Set(ids).size);assert.equal(await page.locator('#stage clipPath').count(),2);await exported.screenshot({path:path.join(output,'export.png')});await exported.close();
 });
 await pass('cross origin embedded symbol players keep separate clocks and definition state',async()=>{
  const host=await browser.newPage({viewport:{width:700,height:500}});host.on('pageerror',e=>errors.push(e.message));await host.goto(local+'host.html');const assets=process.env.RASH_TEST_URL||local.replace('127.0.0.1','localhost');
  const result=await host.evaluate(async({assets,fixture,movieclip})=>{
   await import(assets+'embed.js');const players=[];
   for(let i=0;i<2;i++){const p=document.createElement('rash-player');p.setAttribute('controls','');p.style.width='300px';const loaded=new Promise(ok=>p.addEventListener('rash-load',ok,{once:true}));const data=document.createElement('script');data.type='application/json';data.textContent=JSON.stringify(fixture);p.append(data);document.body.append(p);await loaded;players.push(p);}
   players[0].seek(10);players[1].seek(25);const transform=p=>p.shadowRoot.querySelector('[data-instance-path="left/child/leaf"]').getAttribute('transform');const before=transform(players[1]);players[0].seek(45);
   const ids=players.flatMap(p=>[...p.shadowRoot.querySelectorAll('defs [id]')].map(e=>e.id));const state=players[0].project;state.symbols[0].nodes[0].fill='#ff0000';
   const clip=document.createElement('rash-player');clip.setAttribute('controls','');clip.setAttribute('loop','');const loaded=new Promise(ok=>clip.addEventListener('rash-load',ok,{once:true}));const data=document.createElement('script');data.type='application/json';data.textContent=JSON.stringify(movieclip);clip.append(data);document.body.append(clip);await loaded;
   const clipTransform=()=>clip.shadowRoot.querySelector('[data-instance-path="instance/leaf"]').getAttribute('transform'),initial=clipTransform();clip.play();
   const crossed=await new Promise(resolve=>{const deadline=performance.now()+2000,probe=()=>clip.currentFrame===0&&clipTransform()!==initial?resolve(clipTransform()):performance.now()>deadline?resolve(null):requestAnimationFrame(probe);probe();});
   clip.pause();const frozen=clipTransform();await new Promise(resolve=>setTimeout(resolve,180));const stayed=frozen===clipTransform();clip.play();const resumed=await new Promise(resolve=>{const deadline=performance.now()+1000,probe=()=>clipTransform()!==frozen?resolve(true):performance.now()>deadline?resolve(false):requestAnimationFrame(probe);probe();});clip.pause();
   return {frames:players.map(p=>p.currentFrame),unaffected:before===transform(players[1]),unique:ids.length===new Set(ids).size,isolated:players[1].project.symbols[0].nodes[0].fill==='#00ff00',left:transform(players[0]),right:transform(players[1]),movieclip:{initial,crossed,stayed,resumed}};
  },{assets,fixture:nestedFixture(),movieclip:movieclipFixture()});assert.deepEqual(result.frames,[45,25]);assert.ok(result.unaffected&&result.unique&&result.isolated);assert.notEqual(result.left,result.right);assert.ok(result.movieclip.crossed&&result.movieclip.crossed!==result.movieclip.initial);assert.ok(result.movieclip.stayed&&result.movieclip.resumed);await host.close();
 });
 await pass('symbol resources resolve full root definitions and malformed imports preserve the current document',async()=>{
  const p=await read();const result=await page.evaluate(()=>window.RashStudio.resources.resolve('rash://symbol/inner'));assert.equal(result.value.id,'inner');
  const malformed=structuredClone(p);malformed.symbols[0].nodes.push({id:'cycle',type:'symbol',symbolId:'outer'});await page.locator('#project-import').setInputFiles({name:'cycle.rash.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(malformed))});await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('Could not open project'));assert.deepEqual(await read(),p);assert.match(await page.locator('#toast').textContent(),/cycles/);
 });
 assert.deepEqual(errors,[]);await page.screenshot({path:path.join(output,'desktop.png'),fullPage:true});await fs.writeFile(path.join(output,'evidence.json'),JSON.stringify({url:base,browser:name,checks,errors,limitations:['Independent MovieClip clocks have no per-clip stop/play, lifecycle events, frame scripts or full ActionScript semantics.','Phone viewport emulation; no physical device claim.']},null,2)+'\n');console.log(`${checks.length} ${name} symbol checks passed`);
}catch(error){await(phone||page)?.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});await fs.writeFile(path.join(output,'evidence.json'),JSON.stringify({url:base,browser:name,checks,failedCheck:active,error:error.message,errors},null,2));throw error;}
finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}

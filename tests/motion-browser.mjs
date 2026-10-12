import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium,webkit} from 'playwright';

const browserName=process.env.RASH_BROWSER||'chromium',root=path.resolve('web');
assert.ok(['chromium','webkit'].includes(browserName));
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.wasm':'application/wasm','.json':'application/json','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{try{if(req.url==='/__motion-export.svg'){res.writeHead(200,{'Content-Type':'image/svg+xml'}).end(svgText);return;}let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));if(file===root)file=path.join(root,'index.html');if(!file.startsWith(root+path.sep))throw Error();res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'}).end(await fs.readFile(file));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=process.env.RASH_TEST_URL||`http://127.0.0.1:${server.address().port}/`;
const browser=await({chromium,webkit}[browserName]).launch({headless:true,...(browserName==='chromium'?{args:['--no-sandbox']}: {})});
const page=await browser.newPage({viewport:{width:1600,height:1000},hasTouch:true,locale:'en-US'});
page.setDefaultTimeout(10000);
const checks=[],errors=[],directory=path.resolve('test-results/motion-'+browserName);let active='boot',phone,svgText;
await fs.mkdir(directory,{recursive:true});page.on('pageerror',e=>errors.push(e.message));
const check=async(name,fn)=>{active=name;await fn();checks.push(name);console.log('PASS',name);};
const tap=el=>el.tap();
const project=(p=page)=>p.evaluate(()=>window.RashStudio.getProject());
const command=async name=>{await tap(page.getByRole('button',{name:'Open command palette',exact:true}));await page.getByLabel('Search commands',{exact:true}).fill(name);await tap(page.locator('#command-list button').first());};
const close=()=>tap(page.locator('#modal').getByRole('button',{name:'Close dialog',exact:true}));
const geometry=async(p,id)=>p.locator(`#stage [data-node-id="${id}"] [data-face-id]`).evaluateAll(nodes=>nodes.map(n=>n.getAttribute('d')).join('|'));
const input=async(label,value,p=page)=>{const el=p.getByLabel(label,{exact:true});await tap(el);await el.fill(String(value));};
const newProject=async template=>{await command('New composition');await tap(page.locator(`[data-wizard-template="${template}"]`));await tap(page.locator('[data-wizard-preset="classic"]'));const replace=page.getByRole('checkbox',{name:/Replace the current composition/});if(await replace.count())await tap(replace);await tap(page.locator('[data-action="create-project"]'));};
try{
 await page.goto(base);await page.waitForFunction(()=>window.RashStudio);let meshId;
 await check('visible 3D workspace creates real projected primitive layers',async()=>{
  await newProject('blank');await tap(page.locator('.mode-tabs [data-action="three-workspace"]'));await tap(page.locator('[data-primitive="torus"]'));
  const p=await project(),node=p.nodes.at(-1);meshId=node.id;assert.equal(node.type,'mesh');assert.equal(node.primitive,'torus');assert.ok((await geometry(page,meshId)).length>200);
 });
 await check('3D rotation, depth, material and wireframe edit the actual SVG',async()=>{
  const before=await geometry(page,meshId);await input('3D rotation X',67);await input('3D rotation Y',42);await input('3D depth',80);
  const n=(await project()).nodes.find(n=>n.id===meshId);assert.equal(n.rotationX,67);assert.equal(n.rotationY,42);assert.equal(n.z,80);assert.notEqual(await geometry(page,meshId),before);
  await page.getByLabel('Wireframe',{exact:true}).check();assert.ok(await page.locator(`#stage [data-node-id="${meshId}"] path`).evaluateAll(nodes=>nodes.every(n=>n.getAttribute('fill')==='none')));await page.getByLabel('Wireframe',{exact:true}).uncheck();
 });
 await check('camera settings change projection and undo restores the camera',async()=>{
  const before=await geometry(page,meshId);await tap(page.getByRole('button',{name:'Scene camera',exact:true}));await input('Camera yaw',35);await input('Camera pitch',20);await tap(page.getByRole('button',{name:'Apply camera',exact:true}));
  assert.equal((await project()).camera.yaw,35);assert.notEqual(await geometry(page,meshId),before);await command('Undo');assert.equal((await project()).camera.yaw,0);assert.equal(await geometry(page,meshId),before);await command('Redo');assert.equal((await project()).camera.yaw,35);
 });
 await check('Rust WASM script commands update 3D geometry and effects through the editor',async()=>{
  await tap(page.locator('.mode-tabs [data-action="script"]'));await page.getByLabel('ActionScript editor',{exact:true}).fill(`var mesh:MovieClip = getNode("${meshId}"); mesh.rotationX = 72; mesh.z = 90; mesh.glow = 5; mesh.blendMode = "screen"; trace("3d-ready");`);
  await tap(page.getByRole('button',{name:'Run script',exact:true}));await page.waitForFunction(()=>document.querySelector('#script-output').textContent.includes('3d-ready'));
  const n=(await project()).nodes.find(n=>n.id===meshId);assert.equal(n.rotationX,72);assert.equal(n.z,90);assert.equal(n.glow,5);assert.equal(n.blendMode,'screen');await close();
 });
 await check('blur, glow and blending are retained SVG effects',async()=>{
  await input('Blur',3);await input('Glow',6);await page.getByLabel('Blend mode',{exact:true}).selectOption('screen');
  const p=await project(),n=p.nodes.find(n=>n.id===meshId);assert.equal(n.blur,3);assert.equal(n.glow,6);assert.equal(n.blendMode,'screen');
  assert.ok(await page.locator(`#stage [data-node-id="${meshId}"]`).getAttribute('filter'));assert.equal(await page.locator('#stage feGaussianBlur').first().getAttribute('stdDeviation'),'3');assert.equal(await page.locator('#stage feDropShadow').first().getAttribute('stdDeviation'),'6');
 });
 await check('3D motion preset authors keys and scrubbing changes geometry',async()=>{
  await tap(page.getByRole('tab',{name:'Motion',exact:true}));await tap(page.getByRole('button',{name:'Browse motion presets',exact:true}));await tap(page.locator('[data-motion-preset="spin3d"]'));await input('Motion duration in seconds',2);await tap(page.getByRole('button',{name:'Apply motion',exact:true}));
  await tap(page.getByRole('button',{name:'Browse motion presets',exact:true}));await tap(page.locator('[data-motion-preset="blurReveal"]'));await input('Motion duration in seconds',2);await tap(page.getByRole('button',{name:'Apply motion',exact:true}));let n=(await project()).nodes.find(n=>n.id===meshId);assert.ok(n.keyframes.some(k=>k.frame===60&&k.rotationY===402));assert.ok(n.keyframes.some(k=>k.frame===0&&k.blur===18));const before=await geometry(page,meshId);await input('Current frame',16);assert.notEqual(await geometry(page,meshId),before);
 });
 await check('Bezier values and graph gestures update easing and preserve undo',async()=>{
  await tap(page.getByRole('button',{name:'Go to keyframe 61',exact:true}));await page.getByLabel('Keyframe easing',{exact:true}).selectOption('bezier');await input('Bezier x1',.12);await input('Bezier y1',.8);await input('Bezier x2',.7);await input('Bezier y2',1.2);
  assert.deepEqual((await project()).nodes.find(n=>n.id===meshId).keyframes.find(k=>k.frame===60).bezier,[.12,.8,.7,1.2]);
  await page.locator('#curve-graph').scrollIntoViewIfNeeded();const graph=await page.locator('#curve-graph').boundingBox(),handle=await page.locator('[data-curve-handle="0"]').boundingBox();await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();await page.mouse.move(graph.x+graph.width*.45,graph.y+graph.height*.5,{steps:6});await page.mouse.up();
  const curve=(await project()).nodes.find(n=>n.id===meshId).keyframes.find(k=>k.frame===60).bezier;assert.notDeepEqual(curve,[.12,.8,.7,1.2]);await command('Undo');assert.deepEqual((await project()).nodes.find(n=>n.id===meshId).keyframes.find(k=>k.frame===60).bezier,[.12,.8,.7,1.2]);await command('Redo');
 });
 await check('keyframe time editing moves the actual key and survives reload',async()=>{
  await input('Keyframe position',71);assert.ok((await project()).nodes.find(n=>n.id===meshId).keyframes.some(k=>k.frame===70));assert.equal(await page.evaluate(()=>window.RashStudio.getFrame()),70);
  await page.waitForFunction(()=>document.querySelector('#save-status').textContent.includes('Saved on this device'));const before=await project();await page.reload();await page.waitForFunction(()=>window.RashStudio);assert.deepEqual(await project(),before);
 });
 await check('animated SVG export contains projected geometry and animated effects',async()=>{
  await command('Export composition');await tap(page.locator('[data-format="svg"]'));const dl=page.waitForEvent('download');await tap(page.locator('[data-action="download-export"]'));const download=await dl;svgText=await fs.readFile(await download.path(),'utf8');assert.match(svgText,/data-mesh-frame=/);assert.match(svgText,/feGaussianBlur/);assert.match(svgText,/attributeName="stdDeviation"/);assert.match(svgText,/mix-blend-mode:screen/);assert.ok(Buffer.byteLength(svgText)<16_000_000);await close();
 });
 await check('standalone exported SVG shows one mesh frame and animates its pixels',async()=>{
  const exported=await browser.newPage({viewport:{width:550,height:400}});await exported.goto(`http://127.0.0.1:${server.address().port}/__motion-export.svg`);
  const sample=async time=>{await exported.evaluate(t=>{document.documentElement.pauseAnimations();document.documentElement.setCurrentTime(t);},time);await exported.waitForTimeout(80);const count=await exported.locator('[data-mesh-frame]').evaluateAll(nodes=>nodes.filter(n=>getComputedStyle(n).display!=='none').length);assert.equal(count,1);return exported.screenshot();};
  const first=await sample(0),later=await sample(.6);assert.notDeepEqual(first,later);await exported.close();
 });
 await check('dimension template includes animated 3D artwork and portable camera state',async()=>{
  await newProject('dimension');const p=await project();assert.ok(p.nodes.filter(n=>n.type==='mesh').length>=2);assert.ok(p.nodes.some(n=>n.type==='mesh'&&n.keyframes.length));assert.ok(p.camera);assert.ok(await page.locator('#stage [data-face-id]').count()>20);await page.screenshot({path:path.join(directory,'desktop.png'),fullPage:true});
 });
 await check('phone touch controls create, edit and animate a 3D object',async()=>{
  phone=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true,locale:'en-US'});phone.on('pageerror',e=>errors.push(e.message));await phone.goto(base);await phone.waitForFunction(()=>window.RashStudio);
  await tap(phone.locator('.mobile-nav').getByRole('button',{name:'More',exact:true}));await tap(phone.getByRole('button',{name:'3D objects and camera',exact:true}));await tap(phone.locator('[data-primitive="box"]'));if(!await phone.locator('#right-panel').evaluate(el=>el.classList.contains('mobile-open')))await tap(phone.getByRole('button',{name:'Edit selected layer',exact:true}));
  await input('3D rotation X',52,phone);await input('Glow',4,phone);let p=await project(phone),n=p.nodes.at(-1);assert.equal(n.rotationX,52);assert.equal(n.glow,4);assert.ok((await geometry(phone,n.id)).length>20);
  await tap(phone.getByRole('button',{name:'Scene camera',exact:true}));await input('Camera yaw',24,phone);await tap(phone.getByRole('button',{name:'Apply camera',exact:true}));assert.equal((await project(phone)).camera.yaw,24);
  await tap(phone.getByRole('button',{name:'Edit selected layer',exact:true}));await tap(phone.getByRole('tab',{name:'Motion',exact:true}));await tap(phone.getByRole('button',{name:'Browse motion presets',exact:true}));await tap(phone.locator('[data-motion-preset="spin3d"]'));await tap(phone.getByRole('button',{name:'Apply motion',exact:true}));
  n=(await project(phone)).nodes.find(item=>item.id===n.id);assert.ok(n.keyframes.some(k=>k.rotationY>=360));await tap(phone.getByRole('button',{name:'Close inspector',exact:true}));await phone.screenshot({path:path.join(directory,'phone.png'),fullPage:true});
  const count=(await project(phone)).nodes.length;await tap(phone.getByRole('button',{name:'Delete selected layer',exact:true}));assert.equal((await project(phone)).nodes.length,count-1);await tap(phone.getByRole('button',{name:'Undo',exact:true}));assert.equal((await project(phone)).nodes.length,count);
  assert.ok(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 });
 await check('no uncaught application errors during 3D and motion authoring',async()=>assert.deepEqual(errors,[]));
 await fs.writeFile(path.join(directory,'evidence.json'),JSON.stringify({url:base,browser:browserName,checks,errors,limitations:['Browser emulation, no physical device or keyboard proof.','SVG layers do not share an interobject depth buffer.']},null,2));console.log(`${checks.length} ${browserName} motion checks passed`);
}catch(error){await(phone||page).screenshot({path:path.join(directory,'failure.png'),fullPage:true}).catch(()=>{});await fs.writeFile(path.join(directory,'evidence.json'),JSON.stringify({url:base,browser:browserName,checks,failedCheck:active,error:error.message,errors},null,2));throw error;}
finally{await browser.close();await new Promise(r=>server.close(r));}

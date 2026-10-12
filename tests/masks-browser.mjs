import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium,webkit} from 'playwright';

const browserName=process.env.RASH_BROWSER||'chromium';
assert.ok(['chromium','webkit'].includes(browserName));
const root=path.resolve('web'),types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.wasm':'application/wasm','.svg':'image/svg+xml','.json':'application/json'};
let exportedSVG='';
const server=http.createServer(async(req,res)=>{
 try{
  if(req.url==='/mask.svg'){res.writeHead(200,{'Content-Type':'image/svg+xml'}).end(exportedSVG);return;}
  if(req.url==='/host.html'){res.writeHead(200,{'Content-Type':'text/html'}).end('<!doctype html><title>Independent embed host</title><body style="margin:0">');return;}
  let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));if(file===root)file=path.join(root,'index.html');if(!file.startsWith(root+path.sep))throw Error();
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Access-Control-Allow-Origin':'*'}).end(await fs.readFile(file));
 }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const local=`http://127.0.0.1:${server.address().port}/`,base=process.env.RASH_TEST_URL||local;
const browser=await({chromium,webkit}[browserName]).launch({headless:true,...(browserName==='chromium'?{args:['--no-sandbox']}: {})});
const page=await browser.newPage({viewport:{width:1600,height:1000},hasTouch:true});
page.setDefaultTimeout(10000);
const checks=[],errors=[],directory=path.resolve('test-results/masks-'+browserName);let active='boot',phone,id;
await fs.mkdir(directory,{recursive:true});page.on('pageerror',e=>errors.push(e.message));
const tap=locator=>locator.tap();
const project=(p=page)=>p.evaluate(()=>window.RashStudio.getProject());
const node=async(p=page)=>(await project(p)).nodes.find(n=>n.id===id);
const input=async(label,value,p=page)=>{const el=p.getByLabel(label,{exact:true});await tap(el);await el.fill(String(value));};
const close=(p=page)=>tap(p.locator('#modal').getByRole('button',{name:'Close dialog',exact:true}));
const check=async(name,fn)=>{active=name;await fn();checks.push(name);console.log('PASS',name);};
async function command(name,p=page){await tap(p.getByRole('button',{name:'Open command palette',exact:true}));await p.getByLabel('Search commands',{exact:true}).fill(name);await tap(p.locator('#command-list button').first());}
async function blank(){await command('New composition');await tap(page.locator('[data-wizard-template="blank"]'));await tap(page.locator('[data-wizard-preset="classic"]'));const replace=page.getByRole('checkbox',{name:/Replace the current composition/});if(await replace.count())await tap(replace);await tap(page.locator('[data-action="create-project"]'));}
async function preset(name,p=page){await tap(p.getByRole('button',{name:'Browse motion presets',exact:true}));await tap(p.locator(`[data-motion-preset="${name}"]`));await input('Motion duration in seconds',2,p);await tap(p.getByRole('button',{name:'Apply motion',exact:true}));}
async function greenPixels(p,bytes){return p.evaluate(async src=>{const img=new Image();await new Promise((ok,no)=>{img.onload=ok;img.onerror=no;img.src=src;});const c=document.createElementNS('http://www.w3.org/1999/xhtml','canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);const a=ctx.getImageData(0,0,c.width,c.height).data;let count=0;for(let i=0;i<a.length;i+=4)if(a[i]<100&&a[i+1]>160&&a[i+2]<100)count++;return count;},'data:image/png;base64,'+bytes.toString('base64'));}
const stagePixels=async()=>greenPixels(page,await page.locator('#stage').screenshot());
try{
 await page.goto(base);await page.waitForFunction(()=>window.RashStudio);
 let fullPixels;
 await check('rectangle mask controls crop real stage pixels and fit restores the layer',async()=>{
  await blank();await command('Add rectangle');id=(await project()).nodes.at(-1).id;
  await page.getByLabel('Fill color',{exact:true}).fill('#00ff00');await input('Width',200);await input('Height',120);await input('Corner radius',0);
  fullPixels=await stagePixels();assert.ok(fullPixels>1000);
  await page.getByLabel('Mask shape',{exact:true}).selectOption('rect');await input('Mask width',100);
  assert.equal((await node()).maskWidth,100);assert.ok(await page.locator(`#stage [data-node-id="${id}"]`).getAttribute('clip-path'));
  const half=await stagePixels();assert.ok(half>fullPixels*.4&&half<fullPixels*.6,`${half} versus ${fullPixels}`);
  await input('Mask rotation',15);assert.equal((await node()).maskRotation,15);
  await tap(page.getByRole('button',{name:'Fit mask to layer',exact:true}));assert.equal((await node()).maskWidth,200);assert.equal((await node()).maskRotation,0);
  assert.ok(await stagePixels()>fullPixels*.95);
 });
 await check('wipe reveal authors mask keys and visibly reveals a layer without changing its geometry',async()=>{
  await tap(page.getByRole('button',{name:'Animate mask',exact:true}));
  await tap(page.locator('[data-motion-preset="wipeReveal"]'));await input('Motion duration in seconds',2);await tap(page.getByRole('button',{name:'Apply motion',exact:true}));
  let n=await node();assert.equal(n.maskType,'rect');assert.equal(n.keyframes.find(k=>k.frame===0).maskWidth,0);assert.equal(n.keyframes.find(k=>k.frame===60).maskWidth,200);
  assert.equal(await stagePixels(),0);await input('Current frame',61);assert.ok(await stagePixels()>fullPixels*.95);assert.equal((await node()).width,200);
 });
 await check('mask width and opacity have independent easing at the same frame',async()=>{
  await input('Current frame',1);await preset('fadeIn');await input('Current frame',61);
  await page.getByLabel('Motion property',{exact:true}).selectOption('opacity');await page.getByLabel('Keyframe easing',{exact:true}).selectOption('linear');
  await page.getByLabel('Motion property',{exact:true}).selectOption('maskWidth');await page.getByLabel('Keyframe easing',{exact:true}).selectOption('easeOut');await input('Current frame',31);
  const sample=await page.evaluate(async id=>{const {evaluateNode}=await import('./core/model.js');return evaluateNode(window.RashStudio.getProject().nodes.find(n=>n.id===id),30);},id);
  assert.equal(sample.maskWidth,150);assert.equal(sample.opacity,.5);assert.equal(Number(await page.locator(`#stage [data-node-id="${id}"]`).getAttribute('opacity')),.5);
 });
 await check('fitting at a nonzero frame preserves unrelated tracks and is exactly undoable',async()=>{
  const before=await project();await tap(page.getByRole('tab',{name:'Properties',exact:true}));await tap(page.getByRole('button',{name:'Fit mask to layer',exact:true}));
  const middle=(await node()).keyframes.find(k=>k.frame===30);assert.equal(middle.maskWidth,200);assert.equal(middle.opacity,undefined);
  await command('Undo');assert.deepEqual(await project(),before);
 });
 await check('remove clears only mask tracks and undo restores the exact source',async()=>{
  const before=await project();await tap(page.getByRole('button',{name:'Remove mask',exact:true}));const n=await node();assert.equal(n.maskType,'none');assert.ok(n.keyframes.some(k=>Number.isFinite(k.opacity)));
  assert.ok(n.keyframes.every(k=>!Object.keys(k).some(key=>key.startsWith('mask'))));assert.equal(await page.locator('#stage clipPath').count(),0);
  await command('Undo');assert.deepEqual(await project(),before);
 });
 await check('choosing None clears mask tracks in one exactly undoable transaction',async()=>{
  const before=await project();await page.getByLabel('Mask shape',{exact:true}).selectOption('none');const n=await node();assert.equal(n.maskType,'none');
  assert.ok(n.keyframes.every(k=>!Object.keys(k).some(key=>key.startsWith('mask'))));assert.ok(n.keyframes.some(k=>Number.isFinite(k.opacity)));
  await command('Undo');assert.deepEqual(await project(),before);
 });
 await check('locked masked layers disable all mask controls',async()=>{
  const before=await project();const lock=page.locator(`[data-layer-action="lock"][data-id="${id}"]`);await tap(lock);
  for(const label of ['Mask shape','Mask X','Mask Y','Mask width','Mask height','Mask rotation'])assert.equal(await page.getByLabel(label,{exact:true}).isDisabled(),true,label);
  for(const name of ['Fit mask to layer','Remove mask','Animate mask'])assert.equal(await page.getByRole('button',{name,exact:true}).isDisabled(),true,name);
  await tap(lock);assert.deepEqual(await project(),before);
 });
 await check('ellipse iris produces a full reveal and survives reload with SVG export',async()=>{
  await tap(page.getByRole('tab',{name:'Motion',exact:true}));await input('Current frame',1);await preset('irisReveal');assert.equal((await node()).maskType,'ellipse');assert.equal(await stagePixels(),0);
  await input('Current frame',61);assert.ok(await stagePixels()>fullPixels*.95);
  await page.waitForFunction(()=>document.querySelector('#save-status').textContent.includes('Saved on this device'));const before=await project();await page.reload();await page.waitForFunction(()=>window.RashStudio);assert.deepEqual(await project(),before);
  await command('Export composition');await tap(page.locator('[data-format="svg"]'));const pending=page.waitForEvent('download');await tap(page.locator('[data-action="download-export"]'));exportedSVG=await fs.readFile(await(await pending).path(),'utf8');await close();
  assert.match(exportedSVG,/<clipPath/);assert.match(exportedSVG,/<ellipse/);assert.match(exportedSVG,/<animate/);assert.ok(Buffer.byteLength(exportedSVG)<16_000_000);
 });
 await check('downloaded standalone SVG animates the actual clipped pixels',async()=>{
  const svg=await browser.newPage({viewport:{width:550,height:400}});await svg.goto(local+'mask.svg');
  const sample=async time=>{await svg.evaluate(time=>{document.documentElement.pauseAnimations();document.documentElement.setCurrentTime(time);},time);await svg.waitForTimeout(80);return greenPixels(svg,await svg.screenshot());};
  assert.equal(await sample(0),0);assert.ok(await sample(2)>20000);await svg.close();
 });
 await check('PNG clipping and independent embedded mask tracks use the same evaluated geometry',async()=>{
  const host=await browser.newPage({viewport:{width:300,height:200}});host.on('pageerror',e=>errors.push(e.message));await host.goto(local+'host.html');
  // A different hostname makes the local module import genuinely cross origin.
  const assets=process.env.RASH_TEST_URL||local.replace('127.0.0.1','localhost');
  const result=await host.evaluate(async origin=>{
   const {createProject,addNode}=await import(new URL('core/model.js',origin));const {exportProject}=await import(new URL('export/export.js',origin));await import(new URL('embed.js',origin));
   const p=createProject('blank');Object.assign(p,{width:100,height:80,duration:11,fps:10,background:'#000000',script:''});const n=addNode(p,'rect');Object.assign(n,{x:10,y:10,width:60,height:40,rx:0,fill:'#00ff00',maskType:'rect',maskX:0,maskY:0,maskWidth:30,maskHeight:40,maskRotation:0,keyframes:[{frame:0,maskWidth:30,easing:'linear'},{frame:10,maskWidth:60,easing:'linear'}]});
   const a=document.createElement('rash-player'),b=document.createElement('rash-player');a.id='a';b.id='b';for(const player of[a,b]){player.style.cssText='display:block;width:100px;height:80px';document.body.append(player);player.project=p;}a.seek(0);b.seek(10);
   const clip=a.shadowRoot.querySelector('clipPath'),shape=clip.firstElementChild,content=a.shadowRoot.querySelector('[data-node-id]');a.seek(5);const retained=clip===a.shadowRoot.querySelector('clipPath')&&shape===clip.firstElementChild&&content===a.shadowRoot.querySelector('[data-node-id]');a.seek(0);
   const idsDiffer=clip.id!==b.shadowRoot.querySelector('clipPath').id;
   const {blob}=await exportProject(p,'png');return {retained,idsDiffer,png:Array.from(new Uint8Array(await blob.arrayBuffer()))};
  },assets);
  assert.equal(result.retained,true);assert.equal(result.idsDiffer,true);
  const partial=await greenPixels(host,await host.locator('#a').screenshot()),whole=await greenPixels(host,await host.locator('#b').screenshot());assert.ok(partial>1000&&partial<1400);assert.ok(whole>2200);assert.ok(whole>partial*1.8);
  const png=await greenPixels(host,Buffer.from(result.png));assert.equal(png,1200);await host.close();
 });
 await check('mask template opens from the visible wizard',async()=>{
  await command('New composition');await tap(page.locator('[data-wizard-template="mask"]'));const replace=page.getByRole('checkbox',{name:/Replace the current composition/});if(await replace.count())await tap(replace);await tap(page.locator('[data-action="create-project"]'));
  assert.ok((await project()).nodes.some(n=>n.maskType!=='none'&&n.keyframes.some(k=>Number.isFinite(k.maskWidth))));const headline=(await project()).nodes.find(n=>n.name==='Wipe / headline');await tap(page.locator(`[data-layer="${headline.id}"] .layer-name`));await tap(page.getByRole('tab',{name:'Motion',exact:true}));await input('Current frame',111);const glyph=await page.locator(`#stage [data-node-id="${headline.id}"] text`).evaluate(el=>{const b=el.getBBox();return {x:b.x,width:b.width};});assert.ok(glyph.x>=0&&glyph.x+glyph.width<=headline.width,'Completed reveal contains the full headline');await tap(page.getByRole('tab',{name:'Properties',exact:true}));await page.screenshot({path:path.join(directory,'desktop.png'),fullPage:true});
 });
 await check('phone edits a fully clipped layer through Layers and removes its mask with undo',async()=>{
  phone=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});phone.on('pageerror',e=>errors.push(e.message));await phone.goto(base);await phone.waitForFunction(()=>window.RashStudio);
  await tap(phone.locator('.mobile-nav').getByRole('button',{name:'More',exact:true}));await tap(phone.getByRole('button',{name:'3D objects and camera',exact:true}));await tap(phone.locator('[data-primitive="box"]'));id=(await project(phone)).nodes.at(-1).id;
  await phone.getByLabel('Mask shape',{exact:true}).scrollIntoViewIfNeeded();await phone.getByLabel('Mask shape',{exact:true}).selectOption('rect');await input('Mask width',0,phone);
  await tap(phone.getByRole('button',{name:'Close inspector',exact:true}));await tap(phone.locator('.mobile-nav').getByRole('button',{name:'Layers',exact:true}));await tap(phone.locator(`[data-layer="${id}"] .layer-name`));
  await tap(phone.getByRole('button',{name:'Edit selected layer',exact:true}));await input('Mask width',110,phone);assert.equal((await node(phone)).maskWidth,110);
  await tap(phone.getByRole('button',{name:'Animate mask',exact:true}));await tap(phone.locator('[data-motion-preset="wipeReveal"]'));await input('Motion duration in seconds',2,phone);await tap(phone.getByRole('button',{name:'Apply motion',exact:true}));await input('Current frame',61,phone);
  await phone.getByLabel('Motion property',{exact:true}).scrollIntoViewIfNeeded();await phone.getByLabel('Motion property',{exact:true}).selectOption('maskWidth');await phone.getByLabel('Keyframe easing',{exact:true}).selectOption('easeOut');
  await tap(phone.getByRole('tab',{name:'Properties',exact:true}));const before=await project(phone);await tap(phone.getByRole('button',{name:'Remove mask',exact:true}));assert.equal((await node(phone)).maskType,'none');
  await tap(phone.getByRole('button',{name:'Close inspector',exact:true}));await tap(phone.getByRole('button',{name:'Undo',exact:true}));assert.deepEqual(await project(phone),before);
  await phone.waitForFunction(()=>document.querySelector('#save-status').textContent.includes('Saved on this device'));await phone.reload();await phone.waitForFunction(()=>window.RashStudio);assert.deepEqual(await project(phone),before);assert.ok(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await phone.screenshot({path:path.join(directory,'phone.png'),fullPage:true});
 });
 await check('no uncaught errors during mask authoring and export',async()=>assert.deepEqual(errors,[]));
 await fs.writeFile(path.join(directory,'evidence.json'),JSON.stringify({url:base,browser:browserName,checks,errors,limitations:['Browser emulation does not prove physical phone keyboard behavior.','Hard geometric masks only; no feathering or layer references.']},null,2));console.log(`${checks.length} ${browserName} mask checks passed`);
}catch(error){await(phone||page).screenshot({path:path.join(directory,'failure.png'),fullPage:true}).catch(()=>{});await fs.writeFile(path.join(directory,'evidence.json'),JSON.stringify({url:base,browser:browserName,checks,failedCheck:active,error:error.message,errors},null,2));throw error;}
finally{await browser.close();await new Promise(resolve=>server.close(resolve));}

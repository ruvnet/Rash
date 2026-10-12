import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {chromium,webkit} from 'playwright';

const root=path.resolve('web'),types={'.html':'text/html','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{try{let file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(root+path.sep))throw Error();if((await fs.stat(file)).isDirectory())file=path.join(file,'index.html');res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'}).end(await fs.readFile(file));}catch{res.writeHead(404).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=process.env.RASH_TEST_URL||`http://127.0.0.1:${server.address().port}/`,name=process.env.RASH_BROWSER||'chromium';
const browser=await({chromium,webkit}[name]).launch({headless:true,...(name==='chromium'?{args:['--no-sandbox']}: {})});
const output=path.resolve('test-results/header-'+name);await fs.mkdir(output,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex'),checks=[],errors=[];
const pass=s=>{checks.push(s);console.log('PASS',s);};
try{
 const page=await browser.newPage({viewport:{width:1200,height:720}});page.on('pageerror',e=>errors.push(e.message));
 const response=await page.request.get(base+'header/rash-header.svg');assert.equal(response.status(),200);
 const bytes=await response.body(),manifest=await(await page.request.get(base+'header/manifest.json')).json();
 assert.equal(hash(bytes),manifest.sha256);assert.equal(bytes.length,manifest.svgBytes);assert.equal(gzipSync(bytes).length,manifest.gzipBytes);assert.ok(bytes.length<150000);assert.ok(manifest.gzipBytes<25000);
 await page.goto(base+'header/rash-header.svg');assert.equal(await page.locator('parsererror').count(),0);
 const isolation=await page.evaluate(()=>{
  const ids=[...document.querySelectorAll('[id]')].map(e=>e.id),invalid=[];
  for(const el of document.querySelectorAll('*'))for(const a of el.attributes){if(/^on/i.test(a.name))invalid.push(a.name);if(/href$/.test(a.name)&&!a.value.startsWith('#'))invalid.push(a.value);for(const m of a.value.matchAll(/url\(([^)]+)\)/g))if(!m[1].startsWith('#')||!document.getElementById(m[1].slice(1)))invalid.push(m[1]);}
  return {badElements:document.querySelectorAll('script,foreignObject,image,iframe').length,invalid,unique:ids.length===new Set(ids).size,title:document.querySelector('title')?.textContent};
 });assert.equal(isolation.badElements,0);assert.deepEqual(isolation.invalid,[]);assert.ok(isolation.unique);assert.match(isolation.title,/Rash/);assert.ok(!/@import|https?:\/\/[^\s"<]*\.(?:woff|png|jpg|css)/.test(bytes.toString()));
 pass('Self contained SVG, local references, accessible title and bounded verified payload');
 const sample=async time=>{await page.evaluate(t=>{document.documentElement.pauseAnimations();document.documentElement.setCurrentTime(t);for(const a of document.getAnimations()){a.pause();a.currentTime=t*1000;}},time);await page.waitForTimeout(50);};
 const snapshots=[];
 for(const [index,time]of [2,7,12,17].entries()){
  await sample(time);
  const visible=await page.locator('[data-chapter]').evaluateAll(es=>es.filter(e=>Number(getComputedStyle(e).opacity)>.95).map(e=>Number(e.dataset.chapter)));assert.deepEqual(visible,[index]);
  const overflow=await page.locator('text').evaluateAll(es=>es.filter(e=>{const r=e.getBBox();return r.x<0||r.y<0||r.x+r.width>1200.5||r.y+r.height>720.5}).map(e=>e.textContent));assert.deepEqual(overflow,[],'Every label must fit the viewBox');
  const screenshot=await page.screenshot({path:path.join(output,`chapter-${index+1}.png`)});snapshots.push(hash(screenshot));
 }assert.equal(new Set(snapshots).size,4);
 await sample(2);const geometryA=hash(await page.screenshot({clip:{x:765,y:250,width:160,height:160}}));await sample(3);
 assert.notEqual(hash(await page.screenshot({clip:{x:765,y:250,width:160,height:160}})),geometryA,'Projected box pixels must change');pass('Four visible, distinct chapters with complete typography and moving production geometry');
 // The actual README context is an img, where scripts and interaction are unavailable.
 await page.goto(base+'header/');
 await page.evaluate(url=>{const picture=document.createElement('picture'),source=document.createElement('source'),img=document.createElement('img');source.media='(prefers-reduced-motion: reduce)';source.srcset=url+'rash-header.poster.svg';img.src=url+'rash-header.svg';img.alt='Rash capability explainer';img.style.cssText='display:block;width:1200px;height:720px';picture.append(source,img);document.body.replaceChildren(picture);document.body.style.margin='0';},base+'header/');
 await page.locator('img').evaluate(i=>i.decode());
 const imageA=hash(await page.screenshot());await page.waitForTimeout(700);const imageB=hash(await page.screenshot());assert.notEqual(imageA,imageB);
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.waitForFunction(()=>document.querySelector('img').currentSrc.endsWith('rash-header.poster.svg'));await page.locator('img').evaluate(i=>i.decode());await page.waitForTimeout(80);
 const reducedA=hash(await page.screenshot({path:path.join(output,'reduced-motion.png')}));await page.waitForTimeout(700);assert.equal(hash(await page.screenshot()),reducedA);
 pass('README picture animates and selects a pixel stable poster for reduced motion');
 await page.emulateMedia({reducedMotion:'no-preference'});await page.goto(base+'header/rash-header.poster.svg');const poster=hash(await page.screenshot());await page.waitForTimeout(250);assert.equal(hash(await page.screenshot()),poster);assert.equal(await page.locator('animate,animateTransform,animateMotion,set').count(),0);
 pass('Static poster contains no SMIL and does not change pixels');
 await page.goto(base+'header/');await page.waitForFunction(()=>!document.querySelector('#toggle').disabled);
 await page.getByRole('button',{name:'Pause animation',exact:true}).click();
 const time=()=>page.locator('#film').evaluate(o=>o.contentDocument.documentElement.getCurrentTime());
 const paused=await time();await page.waitForTimeout(250);assert.equal(await time(),paused);
 for(const [index,label]of ['01 Design','02 Choreograph','03 Direct in 3D','04 Publish'].entries()){
  await page.getByRole('button',{name:label,exact:true}).click();
  const visible=await page.locator('#film').evaluate(o=>[...o.contentDocument.querySelectorAll('[data-chapter]')].filter(e=>Number(o.contentDocument.defaultView.getComputedStyle(e).opacity)>.95).map(e=>Number(e.dataset.chapter)));assert.deepEqual(visible,[index]);
 }
 await page.getByRole('button',{name:'Play animation',exact:true}).click();const resumed=await time();await page.waitForFunction(t=>document.querySelector('#film').contentDocument.documentElement.getCurrentTime()>t+.15,resumed);
 await page.getByRole('button',{name:'Restart',exact:true}).click();assert.ok(await time()<1);
 const download=page.waitForEvent('download');await page.getByRole('link',{name:'Download SVG',exact:true}).click();assert.equal(hash(await fs.readFile(await(await download).path())),manifest.sha256);
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.getByRole('button',{name:'04 Publish',exact:true}).click();await page.screenshot({path:path.join(output,'phone.png'),fullPage:true});
 pass('Preview pause, resume, chapter navigation, restart, exact download and phone controls');
 await page.emulateMedia({reducedMotion:'reduce'});await page.reload();await page.waitForFunction(()=>!document.querySelector('#toggle').disabled);assert.equal(await page.getByRole('button',{name:'Play animation',exact:true}).count(),1);
 const still=await time();await page.waitForTimeout(200);assert.equal(await time(),still);
 await page.getByRole('button',{name:'03 Direct in 3D',exact:true}).click();assert.ok(await time()>=11&&await time()<11.1);
 await page.getByRole('button',{name:'Play animation',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#film').contentDocument.documentElement.getCurrentTime()>11.1);
 assert.deepEqual(errors,[]);pass('Reduced motion starts paused and supports explicit opt in without page errors');
 await fs.writeFile(path.join(output,'evidence.json'),JSON.stringify({url:base,browser:name,checks,errors,svgBytes:manifest.svgBytes,gzipBytes:manifest.gzipBytes},null,2));console.log(`${checks.length} ${name} header checks passed`);
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}

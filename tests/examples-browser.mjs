import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {chromium,webkit} from 'playwright';
import {parseProject} from '../web/core/model.js';
import {animatedSVG} from '../web/export/svg.js';

const root=path.resolve('web'),type={'.html':'text/html','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.wasm':'application/wasm'};
const server=http.createServer(async(req,res)=>{try{let file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(root+path.sep))throw Error();if((await fs.stat(file)).isDirectory())file=path.join(file,'index.html');res.writeHead(200,{'Content-Type':type[path.extname(file)]||'application/octet-stream'}).end(await fs.readFile(file));}catch{res.writeHead(404).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=process.env.RASH_TEST_URL||`http://127.0.0.1:${server.address().port}/`,browserName=process.env.RASH_BROWSER||'chromium';
const browser=await({chromium,webkit}[browserName]).launch({headless:true,...(browserName==='chromium'?{args:['--no-sandbox']}: {})});
const output=path.resolve('test-results/examples-'+browserName);await fs.mkdir(output,{recursive:true});
const errors=[],checks=[],digest=b=>createHash('sha256').update(b).digest('hex');
try{
 const page=await browser.newPage({viewport:{width:960,height:480}});page.on('pageerror',error=>errors.push(error.message));
 const manifest=await(await page.request.get(base+'examples/manifest.json')).json();
 for(const e of manifest.examples){
  const projectText=await(await page.request.get(base+`examples/${e.id}.rash.json`)).text(),p=parseProject(projectText);
  const raw=await(await page.request.get(base+`examples/${e.id}.svg`)).body();assert.equal(digest(raw),e.sha256);assert.equal(raw.length,e.svgBytes);assert.equal(raw.toString(),animatedSVG(p)+'\n');
  await page.goto(base+`examples/${e.id}.svg`);assert.equal(await page.locator('parsererror').count(),0);
  const sample=async seconds=>{await page.evaluate(t=>{document.documentElement.pauseAnimations();document.documentElement.setCurrentTime(t);},seconds);await page.waitForTimeout(70);return page.screenshot();};
  const a=await sample(.1),b=await sample(e.posterFrame/e.fps);assert.notEqual(digest(a),digest(b),`${e.id} must change visible pixels`);
  await fs.writeFile(path.join(output,e.id+'.png'),b);
  const typography=await page.locator('text').evaluateAll(els=>els.map(el=>({id:el.closest('[data-node-id]').getAttribute('data-node-id'),width:el.getBBox().width})));
  for(const measured of typography){const n=p.nodes.find(n=>n.id===measured.id);assert.ok(measured.width<=n.width+1,`${e.id} ${n.name}: glyph width ${measured.width} exceeds ${n.width}`);assert.ok(n.x+measured.width<=p.width+1,`${n.name} extends past the stage`);}
  const visible=await page.locator('[data-node-id]').evaluateAll(nodes=>nodes.filter(n=>n.querySelector('[data-mesh-frame]')).map(n=>[...n.querySelectorAll('[data-mesh-frame]')].filter(g=>getComputedStyle(g).display!=='none').length));
  for(const count of visible)assert.equal(count,1,'A moving mesh must show exactly one geometry sample');
  for(const time of [.1,e.seconds*.25,e.seconds*.5,e.seconds*.75]){
   await page.evaluate(t=>document.documentElement.setCurrentTime(t),time);
   for(const n of p.nodes.filter(n=>n.type==='mesh')){
    const b=await page.locator(`[data-node-id="${n.id}"]`).evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};});
    assert.ok(b.left>=20&&b.right<=940&&b.top>=55&&b.bottom<=416,`${e.id} ${n.name} must stay inside artwork area at ${time}: ${JSON.stringify(b)}`);
   }
  }
  checks.push(`${e.id}: reproducible export, changing pixels, complete glyphs, isolated mesh samples`);console.log('PASS',checks.at(-1));
 }
 await page.setViewportSize({width:1200,height:900});await page.goto(base+'examples/');await page.waitForFunction(()=>document.querySelectorAll('rash-player').length===6&&[...document.querySelectorAll('rash-player')].every(p=>p.project));
 assert.deepEqual(await page.locator('rash-player').evaluateAll(players=>players.map(p=>p.playing)),[false,false,false,false,false,false]);
 const initial=await page.locator('rash-player').evaluateAll(players=>players.map(p=>p.currentFrame));assert.deepEqual(initial,manifest.examples.map(e=>e.posterFrame));
 await page.getByRole('button',{name:'Play all',exact:true}).click();await page.waitForFunction(initial=>[...document.querySelectorAll('rash-player')].every((p,i)=>p.currentFrame!==initial[i]),initial);
 await page.getByRole('button',{name:'Pause all',exact:true}).click();assert.ok(await page.locator('rash-player').evaluateAll(players=>players.every(p=>!p.playing)));
 const download=page.waitForEvent('download');await page.locator('.downloads').first().getByRole('link',{name:'Project JSON',exact:true}).click();assert.equal(parseProject(await fs.readFile(await(await download).path(),'utf8')).id,manifest.examples[0].id);
 await page.screenshot({path:path.join(output,'gallery-desktop.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.getByRole('button',{name:'Play all',exact:true}).click();await page.getByRole('button',{name:'Pause all',exact:true}).click();
 await page.screenshot({path:path.join(output,'gallery-phone.png'),fullPage:true});checks.push('Gallery: six paused posters, playback, pause, project download and mobile layout');console.log('PASS',checks.at(-1));
 await page.emulateMedia({reducedMotion:'reduce'});await page.reload();await page.waitForFunction(()=>document.querySelectorAll('rash-player').length===6&&[...document.querySelectorAll('rash-player')].every(p=>p.project));assert.ok(await page.locator('rash-player').evaluateAll(players=>players.every(p=>!p.playing)));checks.push('Reduced motion starts paused');assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(output,'evidence.json'),JSON.stringify({url:base,browser:browserName,checks,errors},null,2));console.log(`${checks.length} ${browserName} gallery checks passed`);
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}

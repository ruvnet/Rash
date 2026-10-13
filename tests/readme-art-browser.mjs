import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {chromium,webkit} from 'playwright';

const root=path.resolve('.'),hash=b=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(await fs.readFile('docs/animations/manifest.json','utf8'));
const readme=await fs.readFile('README.md','utf8');
const pictures=[...readme.matchAll(/<picture>[\s\S]*?<\/picture>/g)].map(m=>m[0]).filter(s=>s.includes('docs/animations/'));
assert.equal(pictures.length,4);
// Match GitHub's intrinsic image sizing constraint. A fixed height here is the
// regression that previously turned a landscape header into a tall phone image.
assert.ok(pictures.every(p=>!/<img\b[^>]*\bheight\s*=/.test(p)));
const html=`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#fff}article{max-width:838px;margin:auto;padding:24px 32px}img{max-width:100%;box-sizing:content-box}picture{display:block;margin-bottom:16px}</style><article>${pictures.join('')}</article>`;
const server=http.createServer(async(req,res)=>{
 try{
  const pathname=new URL(req.url,'http://local').pathname;
  if(pathname==='/'){res.writeHead(200,{'Content-Type':'text/html'}).end(html);return;}
  const file=path.resolve(root,'.'+pathname);
  if(!file.startsWith(path.join(root,'docs/animations')+path.sep))throw Error('Outside artwork');
  res.writeHead(200,{'Content-Type':file.endsWith('.svg')?'image/svg+xml':'application/json'}).end(await fs.readFile(file));
 }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}/`,name=process.env.RASH_BROWSER||'chromium';
let browser;
const checks=[],pass=s=>{checks.push(s);console.log('PASS',s);};
const output=path.resolve('test-results/readme-art-'+name);await fs.mkdir(output,{recursive:true});
try{
 browser=await({chromium,webkit}[name]).launch({headless:true,...(name==='chromium'?{args:['--no-sandbox']}: {})});
 const page=await browser.newPage({viewport:{width:960,height:400}}),errors=[],external=[];
 const rawBase='https://raw.githubusercontent.com/ruvnet/Rash/main/docs/animations/';
 await page.route(rawBase+'**',async route=>{
  const file=path.join(root,'docs/animations',route.request().url().slice(rawBase.length));
  try{await route.fulfill({contentType:'image/svg+xml',body:await fs.readFile(file)});}catch{await route.abort();}
 });
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',req=>{if(!req.url().startsWith(base)&&!req.url().startsWith(rawBase))external.push(req.url());});
 assert.equal(hash(await fs.readFile(manifest.source)),manifest.sourceSha256);
 let total=0,totalGzip=0;
 for(const panel of manifest.panels){
  for(const variant of ['animation','poster']){
   const entry=panel[variant],bytes=await fs.readFile(path.join('docs/animations',entry.file));
   assert.equal(bytes.length,entry.bytes);assert.equal(gzipSync(bytes).length,entry.gzipBytes);assert.equal(hash(bytes),entry.sha256);
   assert.ok(!/@import|(?:https?:)?\/\/[^\s"<]*\.(?:woff|png|jpg|css)/.test(bytes.toString()));
  }
  total+=panel.animation.bytes;totalGzip+=panel.animation.gzipBytes;
  await page.goto(base+'docs/animations/'+panel.animation.file);
  assert.equal(await page.locator('parsererror').count(),0);
  const audit=await page.evaluate(()=>{
   const svg=document.documentElement,ids=[...document.querySelectorAll('[id]')].map(e=>e.id),invalid=[];
   for(const el of document.querySelectorAll('*'))for(const a of el.attributes){
    if(/^on/i.test(a.name))invalid.push(a.name);
    if(/href$/.test(a.name)&&!a.value.startsWith('#'))invalid.push(a.value);
    for(const m of a.value.matchAll(/url\(([^)]+)\)/g))if(!m[1].startsWith('#')||!document.getElementById(m[1].slice(1)))invalid.push(m[1]);
   }
   const textOverflow=[...document.querySelectorAll('text')].filter(e=>{
    const b=e.getBBox(),m=e.getCTM(),corners=[[b.x,b.y],[b.x+b.width,b.y+b.height]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(m));
    return corners.some(p=>p.x<0||p.y<0||p.x>960.5||p.y>400.5);
   }).map(e=>e.textContent);
   const cardOverflow=[...document.querySelectorAll('[data-card] text')].filter(e=>{
    const [w,h]=e.closest('[data-card]').dataset.card.split(' ').map(Number),b=e.getBBox();
    return b.x<0||b.y<0||b.x+b.width>w||b.y+b.height>h;
   }).map(e=>e.textContent);
   return {bad:document.querySelectorAll('script,foreignObject,image,iframe,animate,animateTransform,animateMotion').length,invalid,unique:ids.length===new Set(ids).size,textOverflow,cardOverflow,title:svg.querySelector('title')?.textContent};
  });
  assert.equal(audit.bad,0);assert.deepEqual(audit.invalid,[]);assert.ok(audit.unique);assert.deepEqual(audit.textOverflow,[]);assert.deepEqual(audit.cardOverflow,[]);assert.match(audit.title,/Rash/);
  // Deterministic overview for review, using native browser animation clocks.
  await page.evaluate(()=>{for(const a of document.getAnimations()){a.pause();a.currentTime=2300;}});
  await page.screenshot({path:path.join(output,panel.id+'.png')});
 }
 assert.equal(total,manifest.totalAnimatedBytes);assert.equal(totalGzip,manifest.totalAnimatedGzipBytes);assert.ok(total<30000);assert.ok(totalGzip<9000);
 pass('Four isolated accessible SVGs, bounded typography, exact hashes and payload under 30 KB / 9 KB gzip');

 await page.setViewportSize({width:1280,height:1600});await page.goto(base);
 await page.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())));
 const before=[];
 for(const img of await page.locator('img').all())before.push(hash(await img.screenshot()));
 await page.waitForTimeout(1100);
 for(const [i,img]of(await page.locator('img').all()).entries())assert.notEqual(hash(await img.screenshot()),before[i],manifest.panels[i].id+' must animate as an image');
 pass('Every animation changes visible pixels in the actual README picture markup');

 const dimensions=[];
 for(const width of [1280,390]){
  await page.setViewportSize({width,height:1600});
  for(const reduce of [false,true]){
   await page.emulateMedia({reducedMotion:reduce?'reduce':'no-preference'});
   await page.waitForFunction(r=>[...document.querySelectorAll('img')].every(i=>i.currentSrc.endsWith('.poster.svg')===r),reduce);
   await page.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())));
   await page.waitForFunction(()=>[...document.querySelectorAll('img')].every(i=>i.getBoundingClientRect().width>100));
   const sizes=await page.locator('img').evaluateAll(imgs=>imgs.map(i=>{const r=i.getBoundingClientRect();return {src:i.currentSrc,width:r.width,height:r.height,available:i.closest('article').clientWidth-64};}));
   for(const size of sizes){assert.ok(size.width>100&&size.height>0);assert.ok(Math.abs(size.height-size.width*400/960)<.6);assert.ok(size.width<=size.available+.5);}
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));dimensions.push({viewport:width,reduce,sizes});
   if(reduce){
    const still=[];for(const img of await page.locator('img').all())still.push(hash(await img.screenshot()));
    await page.waitForTimeout(400);
    for(const [i,img]of(await page.locator('img').all()).entries())assert.equal(hash(await img.screenshot()),still[i]);
    await page.screenshot({path:path.join(output,`posters-${width}.png`),fullPage:true});
   }
  }
 }
 pass('All four panels keep 12:5 proportions on desktop and phone, with pixel stable reduced motion posters');
 assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(output,'evidence.json'),JSON.stringify({browser:name,checks,dimensions,errors,totalAnimatedBytes:total,totalAnimatedGzipBytes:totalGzip},null,2)+'\n');
 console.log(`${checks.length} ${name} README artwork checks passed`);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}

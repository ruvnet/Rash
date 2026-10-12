// Run: node scripts/benchmark-mask.mjs
// Requires npm ci and npx playwright install chromium. No timing threshold.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {chromium} from 'playwright';

const repository=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),webRoot=path.join(repository,'web');
const viewport={width:1280,height:720},warmupFrames=12,measuredFrames=60;
const cases=[{type:'rect',count:200},{type:'mesh',count:32}];
const server=http.createServer(async(request,response)=>{
 try{
  const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
  if(pathname==='/benchmark'){response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end('<!doctype html><html lang="en"><title>Rash mask benchmark</title><body style="margin:0"></body></html>');return;}
  const file=path.resolve(webRoot,'.'+pathname);
  if(!file.startsWith(webRoot+path.sep)||!file.endsWith('.js'))throw Error('Not a benchmark module');
  response.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'}).end(await fs.readFile(file));
 }catch{response.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/benchmark`);
 const result=await page.evaluate(async({cases,warmupFrames,measuredFrames,viewport})=>{
  const {renderScene,maskAttributes}=await import('/core/renderer.js');
  const {createProject,normalizeNode,validateProject,evaluateNode}=await import('/core/model.js');
  const {animatedSVG}=await import('/export/svg.js');
  const NS='http://www.w3.org/2000/svg',frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
  const makeSVG=()=>{const svg=document.createElementNS(NS,'svg');svg.setAttribute('width',viewport.width);svg.setAttribute('height',viewport.height);document.body.replaceChildren(svg);return svg;};
  const require=(condition,message)=>{if(!condition)throw Error(message);};
  const stats=values=>{const sorted=[...values].sort((a,b)=>a-b),round=n=>Math.round(n*1000)/1000;return {median:round(sorted[Math.floor(sorted.length*.5)]),p95:round(sorted[Math.floor(sorted.length*.95)])};};
  const results=[];
  for(const {type,count}of cases){
   const raw=createProject('blank');raw.width=viewport.width;raw.height=viewport.height;raw.duration=120;
   raw.nodes=Array.from({length:count},(_,index)=>normalizeNode({id:`m${index}`,type,primitive:'box',x:20+(index%20)*62,y:20+Math.floor(index/20)*62,width:54,height:54,fill:'#ff713e',rotationX:25,rotationY:30,maskType:index%2?'ellipse':'rect',maskWidth:0,maskHeight:54,keyframes:[{frame:119,maskWidth:54,maskRotation:45,easing:'linear'}]}));
   const enabled=validateProject(raw),disabled=structuredClone(enabled);for(const node of disabled.nodes)node.maskType='none';
   const observations={disabled:{render:[],cadence:[]},enabled:{render:[],cadence:[]}};
   for(const condition of ['disabled','enabled','enabled','disabled']){
    const project=condition==='enabled'?enabled:disabled,svg=makeSVG();let previous=await frame();
    for(let index=0;index<warmupFrames+measuredFrames;index++){
     const start=performance.now();renderScene(svg,project,index%120);const elapsed=performance.now()-start,current=await frame();
     if(index>=warmupFrames){observations[condition].render.push(elapsed);observations[condition].cadence.push(current-previous);}previous=current;
    }
   }
   const svg=makeSVG();renderScene(svg,enabled,10,{selectedId:'m0'});
   const group=svg.querySelector('[data-node-id="m0"]'),content=group.firstElementChild,definition=svg.querySelector('clipPath'),primitive=definition.firstElementChild;
   renderScene(svg,enabled,90,{selectedId:'m0'});
   require(svg.querySelector('[data-node-id="m0"]')===group&&group.firstElementChild===content,'Content replaced during mask animation');
   require(svg.querySelector('clipPath')===definition&&definition.firstElementChild===primitive,'Clip definition replaced during playback');
   require(svg.querySelector('[data-mask-outline]').getAttribute('pointer-events')==='none','Mask outline captures events');
   for(const [key,value]of Object.entries(maskAttributes(evaluateNode(enabled.nodes[0],90))))require(primitive.getAttribute(key)===String(value),'Retained clip differs from shared geometry');
   const peer=document.createElementNS(NS,'svg');document.body.append(peer);renderScene(peer,enabled,90);
   require(peer.querySelector('clipPath').id!==definition.id,'Renderer mask IDs collide');
   enabled.nodes[0].maskType='ellipse';renderScene(svg,enabled,90);
   require(svg.querySelector('clipPath')===definition&&definition.firstElementChild.localName==='ellipse','Shape change did not retain clip definition');
   enabled.nodes[0].maskType='none';renderScene(svg,enabled,90);
   require(!definition.isConnected&&!group.hasAttribute('clip-path'),'Disabled mask was not cleaned');
   enabled.nodes.splice(1,1);renderScene(svg,enabled,90);
   require(svg.querySelectorAll('clipPath').length===count-2,'Deleted layer mask was not cleaned');
   const summarize=condition=>({renderMs:stats(observations[condition].render),frameIntervalMs:stats(observations[condition].cadence),samples:observations[condition].render.length});
   const baseline=summarize('disabled'),masked=summarize('enabled');
   results.push({type,count,baseline,masked,medianRenderDeltaMs:Math.round((masked.renderMs.median-baseline.renderMs.median)*1000)/1000});
  }
  // One short static mesh with mask-only tracks exposes any geometry sampling
  // inflation in the portable output as well as its useful payload cost.
  const exportProject=createProject('blank');exportProject.duration=120;
  exportProject.nodes=[normalizeNode({id:'box',type:'mesh',primitive:'box',width:100,height:100,maskType:'rect',maskWidth:0,keyframes:[{frame:119,maskWidth:100,easing:'linear'}]})];
  const maskedSVG=animatedSVG(exportProject);exportProject.nodes[0].maskType='none';const baselineSVG=animatedSVG(exportProject);
  require(!maskedSVG.includes('data-mesh-frame'),'Mask-only animation sampled static mesh triangles');
  return {results,retentionChecks:['definition and primitive identity','content identity','shared evaluated geometry','noninteractive selection outline','renderer namespace isolation','shape change','disable cleanup','delete cleanup','static mesh geometry retained'],exports:{maskedSVG,baselineSVG},userAgent:navigator.userAgent};
 },{cases,warmupFrames,measuredFrames,viewport});
 if(errors.length)throw Error(errors.join('; '));
 const exports=Object.fromEntries(Object.entries(result.exports).map(([key,value])=>[key,{bytes:Buffer.byteLength(value),gzipBytes:gzipSync(value).byteLength}]));
 delete result.exports;
 const sourceFiles=['web/core/model.js','web/core/renderer.js','web/export/svg.js','web/core/three-svg.js','web/vendor/three-vector.js','scripts/benchmark-mask.mjs'];
 const sourceHashes=Object.fromEntries(await Promise.all(sourceFiles.map(async filename=>[filename,createHash('sha256').update(await fs.readFile(path.join(repository,filename))).digest('hex')])));
 const report={measuredAt:new Date().toISOString(),command:'node scripts/benchmark-mask.mjs',environment:{node:process.version,platform:os.platform(),release:os.release(),arch:os.arch(),cpu:os.cpus()[0]?.model,cpuCount:os.cpus().length,browser:browser.version(),headless:true,viewport},method:{warmupFrames,measuredFrames,order:['disabled','enabled','enabled','disabled'],baseline:'Identical nodes and mask key evaluation, with maskType none; isolates incremental clip definition and attribute updates.',renderMs:'Synchronous evaluation and SVG DOM update; excludes paint.',frameIntervalMs:'requestAnimationFrame cadence, not physical screen presentation.',limitations:'Headless shared host. Excludes editor panels, user input, mobile hardware and encoding. No timing CI threshold.'},sourceHashes,...result,exports};
 const evidence=path.join(repository,'test-results','benchmark-mask.json');await fs.mkdir(path.dirname(evidence),{recursive:true});await fs.writeFile(evidence,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}

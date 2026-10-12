// Reproduce with: node scripts/benchmark-camera.mjs
// Requires npm ci and npx playwright install chromium. No timing acceptance gate.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';

const repository=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const webRoot=path.join(repository,'web');
const evidence=path.join(repository,'test-results','benchmark-camera.json');
const viewport={width:1280,height:720},warmupFrames=20,measuredFrames=120;
// Balanced ABBA ordering reduces bias from JIT warmup and changing host load.
const order=['static','animated','animated','static'];
const sources=['scripts/benchmark-camera.mjs','web/core/model.js','web/core/renderer.js','web/core/three-svg.js','web/vendor/three-vector.js'];
const hashes=()=>Promise.all(sources.map(async file=>[file,createHash('sha256').update(await fs.readFile(path.join(repository,file))).digest('hex')]));
const initialHashes=Object.fromEntries(await hashes());
const server=http.createServer(async(request,response)=>{
 try{
  const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
  if(pathname==='/benchmark'){
   response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
   response.end('<!doctype html><html lang="en"><title>Rash camera benchmark</title><body style="margin:0"></body></html>');return;
  }
  const file=path.resolve(webRoot,'.'+pathname);
  if(!file.startsWith(webRoot+path.sep)||!file.endsWith('.js'))throw Error('Not a benchmark module');
  const source=await fs.readFile(file);
  response.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'});response.end(source);
 }catch{response.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/benchmark`);
 const result=await page.evaluate(async({viewport,warmupFrames,measuredFrames,order})=>{
  const {renderScene}=await import('/core/renderer.js');
  const {normalizeNode,createProject,validateProject,evaluateCamera,MESH_TRIANGLES}=await import('/core/model.js');
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('width',String(viewport.width));svg.setAttribute('height',String(viewport.height));document.body.append(svg);
  const raf=()=>new Promise(resolve=>requestAnimationFrame(resolve));
  const rounded=n=>Math.round(n*1000)/1000;
  const stats=values=>{const sorted=[...values].sort((a,b)=>a-b);return {median:rounded(sorted[Math.floor(sorted.length*.5)]),p95:rounded(sorted[Math.floor(sorted.length*.95)])};};
  function scene(kind,variant){
   const input=createProject('blank');input.background='#111522';input.duration=kind==='modest'?120:1000;
   input.camera={yaw:0,pitch:0,distance:1000,fov:45,keyframes:[]};
   const count=kind==='modest'?4:8;
   input.nodes=Array.from({length:count},(_,index)=>normalizeNode({id:'mesh'+index,type:'mesh',primitive:kind==='modest'&&index%2?'torus':'box',width:140,height:140,x:80+(index%4)*290,y:80+Math.floor(index/4)*280,rotationX:25,rotationY:20,fill:'#7defd2',glow:kind==='filteredDenseTrack'?2:0}));
   if(variant==='animated')input.camera.keyframes=kind==='modest'?
    [{frame:0,yaw:0,distance:1000},{frame:60,yaw:35,distance:1150,easing:'linear'},{frame:119,yaw:0,distance:1000,easing:'linear'}]:
    Array.from({length:1000},(_,frame)=>({frame,yaw:Math.sin(frame/100)*15,pitch:Math.cos(frame/100)*10,distance:1000+40*Math.sin(frame/100),fov:45,easing:'linear'}));
   return validateProject(input);
  }
  const results=[];
  for(const kind of ['modest','filteredDenseTrack']){
   const runs=[],aggregate={static:{render:[],cadence:[]},animated:{render:[],cadence:[]}};
   for(const [run,variant]of order.entries()){
    const project=scene(kind,variant),renderTimes=[],cadence=[];
    let previous=await raf();
    for(let index=0;index<warmupFrames+measuredFrames;index++){
     for(const node of project.nodes)node.rotationY=20+index*2;
     const start=performance.now();renderScene(svg,project,index%project.duration);const cost=performance.now()-start,current=await raf();
     if(index>=warmupFrames){renderTimes.push(cost);cadence.push(current-previous);}previous=current;
    }
    aggregate[variant].render.push(...renderTimes);aggregate[variant].cadence.push(...cadence);
    runs.push({run:run+1,camera:variant,cameraKeys:project.camera.keyframes.length,renderMs:stats(renderTimes),frameIntervalMs:stats(cadence),samples:measuredFrames,visiblePaths:svg.querySelectorAll('path').length});
   }
   const summary=Object.fromEntries(Object.entries(aggregate).map(([variant,samples])=>[variant,{renderMs:stats(samples.render),frameIntervalMs:stats(samples.cadence),samples:samples.render.length}]));
   const project=scene(kind,'animated');
   results.push({scene:kind,meshes:project.nodes.length,sourceTriangles:project.nodes.reduce((sum,node)=>sum+MESH_TRIANGLES[node.primitive],0),effects:kind==='filteredDenseTrack',summary,incrementalRenderMedianMs:rounded(summary.animated.renderMs.median-summary.static.renderMs.median),runs});
  }
  const cameraEvaluation=[];
  for(const [label,camera]of [['static',scene('modest','static').camera],['threeKeys',scene('modest','animated').camera],['thousandKeys',scene('filteredDenseTrack','animated').camera]]){
   const iterations=camera.keyframes.length>100?2000:100000,microseconds=[];
   let checksum=0;
   for(let index=0;index<2000;index++)checksum+=evaluateCamera(camera,index%120).yaw;
   for(let batch=0;batch<5;batch++){
    const start=performance.now();
    for(let index=0;index<iterations;index++)checksum+=evaluateCamera(camera,index%120).yaw;
    microseconds.push((performance.now()-start)*1000/iterations);
   }
   cameraEvaluation.push({label,keys:camera.keyframes.length,iterationsPerBatch:iterations,batches:5,microsecondsPerEvaluation:stats(microseconds),checksum:rounded(checksum)});
  }
  return {results,cameraEvaluation,userAgent:navigator.userAgent};
 },{viewport,warmupFrames,measuredFrames,order});
 if(errors.length)throw new Error(`Benchmark browser errors: ${errors.join('; ')}`);
 const finalHashes=Object.fromEntries(await hashes());
 if(JSON.stringify(initialHashes)!==JSON.stringify(finalHashes))throw new Error('Benchmark source changed during measurement. Rerun after source is frozen.');
 const report={
  measuredAt:new Date().toISOString(),command:'node scripts/benchmark-camera.mjs',
  environment:{node:process.version,platform:os.platform(),release:os.release(),arch:os.arch(),cpu:os.cpus()[0]?.model,cpuCount:os.cpus().length,browser:browser.version(),headless:true,viewport},
  method:{warmupFrames,measuredFramesPerRun:measuredFrames,order,renderMs:'Synchronous camera evaluation, Three.js projection, filter bounds, and retained SVG DOM updates. Excludes browser paint.',frameIntervalMs:'requestAnimationFrame cadence across updates, not physical display presentation.',cameraEvaluation:'Five warmed batches measuring camera evaluation separately from geometry and DOM.',limitations:'No timing CI threshold. Headless host load and changed projected faces can dominate small differences. A negative delta is not evidence that camera animation improves performance. Excludes editor UI, encoders, mobile hardware, and physical display latency.'},
  sourceHashes:finalHashes,...result
 };
 await fs.mkdir(path.dirname(evidence),{recursive:true});await fs.writeFile(evidence,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
}finally{
 await browser?.close();await new Promise(resolve=>server.close(resolve));
}

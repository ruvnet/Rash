// Reproduce with: node scripts/benchmark-three.mjs
// Requires: npm ci && npx playwright install chromium
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';

const repository=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const webRoot=path.join(repository,'web');
const evidence=path.join(repository,'test-results','benchmark-three.json');
const viewport={width:1280,height:720};
const warmupFrames=20,measuredFrames=100;
const cases=[
 {primitive:'box',count:32,effects:false},
 {primitive:'torus',count:21,effects:false},
 {primitive:'torus',count:8,effects:true}
];
const server=http.createServer(async(request,response)=>{
 try{
  const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
  if(pathname==='/benchmark'){
   response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
   response.end('<!doctype html><html lang="en"><title>Rash Three.js benchmark</title><body style="margin:0"></body></html>');return;
  }
  const file=path.resolve(webRoot,'.'+pathname);
  if(!file.startsWith(webRoot+path.sep)||!file.endsWith('.js'))throw Error('Not a benchmark module');
  const source=await fs.readFile(file);
  response.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'});
  response.end(source);
 }catch{response.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/benchmark`);
 const result=await page.evaluate(async({cases,warmupFrames,measuredFrames,viewport})=>{
  const {renderScene}=await import('/core/renderer.js');
  const {normalizeNode,createProject,validateProject,MESH_TRIANGLES}=await import('/core/model.js');
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('width',String(viewport.width));svg.setAttribute('height',String(viewport.height));document.body.append(svg);
  const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
  const stats=values=>{
   values.sort((a,b)=>a-b);
   const rounded=n=>Math.round(n*100)/100;
   return {median:rounded(values[Math.floor(values.length*.5)]),p95:rounded(values[Math.floor(values.length*.95)])};
  };
  const results=[];
  for(const {primitive,count,effects}of cases){
   const input=createProject('blank');input.background='#111522';
   input.nodes=Array.from({length:count},(_,index)=>normalizeNode({id:'m'+index,type:'mesh',primitive,width:140,height:140,x:25+(index%7)*180,y:20+Math.floor(index/7)*180,rotationX:25,rotationY:index*5,fill:'#ff6b35',blur:effects?1:0,glow:effects?4:0}));
   const project=validateProject(input),renderTimes=[],frameTimes=[];
   let previous=await frame();
   for(let index=0;index<warmupFrames+measuredFrames;index++){
    for(const node of project.nodes)node.rotationY+=2;
    const start=performance.now();renderScene(svg,project);
    const renderTime=performance.now()-start,current=await frame();
    if(index>=warmupFrames){renderTimes.push(renderTime);frameTimes.push(current-previous);}
    previous=current;
   }
   results.push({primitive,count,effects,sourceTriangles:count*MESH_TRIANGLES[primitive],renderMs:stats(renderTimes),frameIntervalMs:stats(frameTimes),visiblePaths:svg.querySelectorAll('path').length,samples:measuredFrames});
  }
  return {results,userAgent:navigator.userAgent};
 },{cases,warmupFrames,measuredFrames,viewport});
 if(errors.length)throw new Error(`Benchmark browser errors: ${errors.join('; ')}`);
 const sourcePaths=['web/core/model.js','web/core/renderer.js','web/core/three-svg.js','web/vendor/three-vector.js'];
 const sourceHashes=Object.fromEntries(await Promise.all(sourcePaths.map(async filename=>[filename,createHash('sha256').update(await fs.readFile(path.join(repository,filename))).digest('hex')])));
 const report={
  measuredAt:new Date().toISOString(),
  command:'node scripts/benchmark-three.mjs',
  environment:{node:process.version,platform:os.platform(),release:os.release(),arch:os.arch(),cpu:os.cpus()[0]?.model,cpuCount:os.cpus().length,browser:browser.version(),headless:true,viewport},
  method:{warmupFrames,measuredFrames,rotationDegreesPerFrame:2,renderMs:'Synchronous Three.js projection and retained SVG DOM updates; excludes browser paint.',frameIntervalMs:'requestAnimationFrame cadence across updates; includes rendering opportunities, not physical screen presentation.',limitations:'Isolated rendering benchmark. Excludes editor panels, user input, encoding, and mobile hardware. Headless browser timing varies with host load.'},
  sourceHashes,...result
 };
 await fs.mkdir(path.dirname(evidence),{recursive:true});
 await fs.writeFile(evidence,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
}finally{
 await browser?.close();await new Promise(resolve=>server.close(resolve));
}

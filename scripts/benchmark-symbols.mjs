import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {cpus,platform,arch} from 'node:os';
import {gzipSync} from 'node:zlib';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createProject,normalizeNode,validateProject,serializeProject,evaluateNode,evaluateSymbolFrame} from '../web/core/model.js';

const base={...createProject('blank'),id:'benchmark',name:'Repeated graphics',width:1280,height:720,duration:240,fps:30};
const child=(index,x=0,y=0)=>{
 const px=6+index*18+x,py=10+y;
 return normalizeNode({id:`r${index}`,name:`Rect ${index}`,type:'rect',x:px,y:py,width:12,height:20,fill:'#7defd2',keyframes:[
  {frame:0,x:px,opacity:.3,easing:'linear'},
  {frame:60,x:px+12,rotation:45,easing:'linear'},
  {frame:120,x:px,opacity:1,easing:'linear'},
  {frame:239,x:px+8,rotation:90,easing:'linear'}
 ]});
};
const offsets=Array.from({length:100},(_,i)=>({x:12+(i%10)*116,y:12+Math.floor(i/10)*64}));
const flat=validateProject({...base,nodes:offsets.flatMap((offset,i)=>Array.from({length:5},(_,j)=>({...child(j,offset.x,offset.y),id:`r${i}_${j}`})))});
const symbols=validateProject({...base,version:2,symbols:[{id:'shared',name:'Shared graphic',width:110,height:50,duration:240,camera:base.camera,nodes:Array.from({length:5},(_,j)=>child(j))}],nodes:offsets.map((offset,i)=>normalizeNode({id:`i${i}`,name:'Shared instance',type:'symbol',symbolId:'shared',width:110,height:50,playback:'loop',firstFrame:0,startFrame:0,...offset}))});
const library=new Map(symbols.symbols.map(symbol=>[symbol.id,symbol]));
function traverse(project,frame){
 let checksum=0,nodes=0,leaves=0;
 const visit=(scope,localFrame,offsetX=0,offsetY=0)=>{
  for(const source of scope.nodes){
   const node=evaluateNode(source,localFrame);nodes++;
   if(node.type==='symbol'){
    const definition=library.get(node.symbolId);
    visit(definition,evaluateSymbolFrame(node,localFrame,definition),offsetX+node.x,offsetY+node.y);
   }else{leaves++;checksum+=node.x+offsetX+node.y+offsetY+node.opacity+node.rotation;}
  }
 };
 visit(project,frame);return {checksum,nodes,leaves};
}
function leafStates(project,frame){
 const states=[];
 const visit=(scope,localFrame,x=0,y=0)=>{
  for(const source of scope.nodes){
   const node=evaluateNode(source,localFrame);
   if(node.type==='symbol'){const definition=library.get(node.symbolId);visit(definition,evaluateSymbolFrame(node,localFrame,definition),x+node.x,y+node.y);}
   else states.push([x+node.x,y+node.y,node.width,node.height,node.opacity,node.rotation,node.scale]);
  }
 };
 visit(project,frame);return states;
}
for(let frame=0;frame<240;frame++){
 const flatStates=leafStates(flat,frame),symbolStates=leafStates(symbols,frame);
 assert.equal(flatStates.length,symbolStates.length);
 flatStates.forEach((state,index)=>state.forEach((value,property)=>assert.ok(Math.abs(value-symbolStates[index][property])<1e-9,`Frame ${frame}, leaf ${index}, property ${property} differs`)));
 const a=traverse(flat,frame),b=traverse(symbols,frame);
 assert.ok(Math.abs(a.checksum-b.checksum)<1e-7);assert.equal(a.nodes,500);assert.equal(b.nodes,600);assert.equal(a.leaves,b.leaves);
}
const fixtures={v1:flat,v2:symbols},samples=Object.fromEntries(Object.keys(fixtures).map(name=>[name,{validate:[],traversal:[]}]));
const warmup=100,iterations=500;
let sink=0;
for(let i=-warmup;i<iterations;i++)for(const name of i%2===0?['v1','v2']:['v2','v1']){
 const fixture=fixtures[name];let start=performance.now();
 sink+=validateProject(fixture).nodes.length;
 const validation=performance.now()-start;start=performance.now();
 sink+=traverse(fixture,((i+warmup)*7)%240).checksum;
 const traversal=performance.now()-start;
 if(i>=0){samples[name].validate.push(validation);samples[name].traversal.push(traversal);}
}
const summarize=values=>{const sorted=values.toSorted((a,b)=>a-b);return {medianMs:(sorted[Math.floor((sorted.length-1)/2)]+sorted[Math.floor(sorted.length/2)])/2,p95Ms:sorted[Math.ceil(sorted.length*.95)-1],samples:sorted.length};};
const sha256=data=>createHash('sha256').update(data).digest('hex');
const provenance={measuredAt:new Date().toISOString(),command:'npm run bench:symbols',sourceSha256:Object.fromEntries(['scripts/benchmark-symbols.mjs','web/core/model.js'].map(path=>[path,sha256(readFileSync(new URL(`../${path}`,import.meta.url)))])),fixtureSha256:Object.fromEntries(Object.entries(fixtures).map(([name,fixture])=>[name,sha256(serializeProject(fixture))]))};
const results={provenance,environment:{node:process.version,platform:platform(),arch:arch(),cpu:cpus()[0]?.model,cpuCount:cpus().length},fixture:{width:1280,height:720,fps:30,duration:240,instances:100,rectanglesPerInstance:5,keysPerRectangle:4,v1:{storedNodes:500,expandedNodes:500,storedKeys:2000},v2:{definitions:1,storedNodes:105,expandedNodes:600,storedKeys:20},validation:'Both projects pre-normalized; validateProject called on each complete document.',traversal:'evaluateNode on every expanded node at one frame; nested local clocks and translation accumulation included; definition Map built once. No DOM, SVG rendering or browser FPS measured.',equivalence:'All 240 frames individually compare 500 leaf x/y/width/height/opacity/rotation/scale values within 1e-9; traversal checksums also agree within 1e-7.'},warmup,iterations,results:{},sink};
for(const [name,fixture]of Object.entries(fixtures)){
 const source=serializeProject(fixture),compact=JSON.stringify(fixture);
 results.results[name]={validate:summarize(samples[name].validate),traversal:summarize(samples[name].traversal),sourceBytes:Buffer.byteLength(source),compactBytes:Buffer.byteLength(compact),gzipBytes:gzipSync(source,{level:9}).length};
}
results.savings={sourcePercent:(1-results.results.v2.sourceBytes/results.results.v1.sourceBytes)*100,compactPercent:(1-results.results.v2.compactBytes/results.results.v1.compactBytes)*100,gzipPercent:(1-results.results.v2.gzipBytes/results.results.v1.gzipBytes)*100};
mkdirSync(new URL('../test-results/',import.meta.url),{recursive:true});
writeFileSync(new URL('../test-results/symbol-benchmark.json',import.meta.url),`${JSON.stringify(results,null,2)}\n`);
console.log(JSON.stringify(results,null,2));

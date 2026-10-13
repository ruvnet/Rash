import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createProject,validateProject,evaluateSymbolFrame,evaluateNode,evaluateCamera} from '../web/core/model.js';
import {sceneToSVG,renderScene,instancePrefix} from '../web/core/renderer.js';
import {animatedSVG} from '../web/export/svg.js';
import {embedCode,exportProject} from '../web/export/export.js';
import {meshPaths} from '../web/core/three-svg.js';

const symbol=(id,symbolId,extra={})=>({id,type:'symbol',symbolId,width:100,height:100,...extra});
const fixture=(extra={})=>validateProject({...createProject('blank'),version:2,duration:12,fps:12,
 symbols:[{id:'mark',name:'Mark',width:100,height:100,duration:5,nodes:[{id:'leaf',type:'rect',x:0,y:10,width:30,height:20,fill:'#ff713e',keyframes:[{frame:4,x:80,easing:'linear'}]}]}],
 nodes:[symbol('a','mark',{x:10,y:20,width:200,height:300}),symbol('b','mark',{x:250,y:20,firstFrame:2})],...extra});
const section=(svg,path)=>{const start=svg.indexOf(`data-instance-path="${path}"`);assert.ok(start>=0,path);const end=svg.indexOf('data-instance-path=',start+20);return svg.slice(start,end<0?undefined:end);};
const values=(svg,type)=>svg.match(new RegExp(`attributeName="transform" type="${type}" values="([^"]+)"`))?.[1].split(';');
const geometryPaths=svg=>[...svg.matchAll(/<path\b[^>]*\sd="([^"]+)"/g)].map(match=>match[1]);

test('still symbols retain hierarchy, scale and independent local frame offsets',()=>{
 const project=fixture(),svg=sceneToSVG(project,3);
 assert.match(section(svg,'a'),/transform="translate\(10 20\)/);
 assert.match(svg,/<g data-symbol-content="mark" transform="scale\(2 3\)">/);
 assert.match(section(svg,'a/leaf'),/transform="translate\(60 10\)/);
 assert.match(section(svg,'b/leaf'),/transform="translate\(0 10\)/);
 assert.doesNotMatch(svg,/<clipPath|<svg[^>]*<svg/,'A symbol stage is not automatically clipped');
 assert.match(sceneToSVG(project,10000),/data-instance-path="a\/leaf" transform="translate\(20 10\)/,'Root frame clamps before the symbol clock');
});

test('symbol size ratios retain subpixel precision instead of rounding small instances to zero',()=>{
 const project=fixture();project.symbols[0].width=4096;project.nodes[0].width=1;
 assert.match(sceneToSVG(project),/scale\(0\.000244140625 3\)/);
 assert.match(animatedSVG(project),/scale\(0\.000244140625 3\)/);
});

test('animated symbol tracks agree with still evaluation for loop, once, single and nested clocks',()=>{
 for(const playback of ['loop','once','single']){
  const project=fixture();project.nodes[0].playback=playback;project.nodes[0].firstFrame=2;project.nodes[0].startFrame=3;
  project.symbols.push({id:'nested',name:'Nested',width:100,height:100,duration:7,nodes:[{...project.nodes[0],id:'inner',x:0,y:0,width:100,height:100}]});
  project.nodes=[symbol('outer','nested',{firstFrame:1,startFrame:2})];
  const clean=validateProject(project),svg=animatedSVG(clean),definition=clean.symbols[0],nested=clean.symbols[1],track=values(section(svg,'outer/inner/leaf'),'translate');
  for(let frame=0;frame<project.duration;frame++){
   const nestedFrame=evaluateSymbolFrame(clean.nodes[0],frame,nested),localFrame=evaluateSymbolFrame(nested.nodes[0],nestedFrame,definition),expected=evaluateNode(definition.nodes[0],localFrame).x;
   assert.match(section(sceneToSVG(clean,frame),'outer/inner/leaf'),new RegExp(`transform="translate\\(${expected} 10\\)`));
   if(playback==='single')assert.equal(track,undefined);else assert.equal(Number(track[frame].split(' ')[0]),expected,`${playback} frame ${frame}`);
  }
  if(track)assert.equal(track.at(-1),track.at(-2),'The final SMIL sample holds the final root frame');
 }
});

test('MovieClip clocks advance below a held parent and SVG preserves their common repeat period',()=>{
 const p=fixture();p.duration=20;p.fps=20;p.symbols[0].duration=12;p.symbols[0].nodes[0].keyframes=[{frame:11,x:110,easing:'linear'}];
 p.symbols.push({id:'holder',name:'Holder',width:100,height:100,duration:1,nodes:[symbol('clip','mark',{playback:'movieclip'})]});
 p.nodes=[symbol('outer','holder',{playback:'single'})];
 const clean=validateProject(p);
 assert.match(section(sceneToSVG(clean,5,{clockFrame:25}),'outer/clip/leaf'),/translate\(10 10\)/);
 const svg=animatedSVG(clean),track=values(section(svg,'outer/clip/leaf'),'translate');
 assert.match(svg,/dur="3s"/,'20 and 12 frame clocks require a 60 frame cycle at 20 fps');
 assert.equal(Number(track[5].split(' ')[0]),50);
 assert.equal(Number(track[25].split(' ')[0]),10,'same root frame has a later independent MovieClip phase');
 assert.equal(Number(track.at(-1).split(' ')[0]),0,'common cycle closes without a discontinuity');
});

test('MovieClip common cycles reject before unbounded SVG sampling',()=>{
 const p=fixture();p.duration=35999;p.symbols[0].duration=36000;p.nodes[0].playback='movieclip';
 assert.throws(()=>animatedSVG(p),/common cycle exceeds the 36,000 frame SVG export limit/);
 p.duration=12;p.symbols[0].duration=5;p.nodes[0].startFrame=2;
 assert.throws(()=>animatedSVG(p),/cannot repeat a delayed MovieClip/);
});

test('symbol key times preserve the full numeric ratio of their authored frame',()=>{
 const p=fixture();p.duration=60;
 const svg=animatedSVG(p),times=svg.match(/keyTimes="([^"]+)"/)[1].split(';').map(Number);
 assert.equal(times.length,p.duration+1);assert.equal(times[0],0);assert.equal(times.at(-1),1);
 times.forEach((time,index)=>assert.equal(time,index/p.duration));
});

test('repeated definitions have unique effect and mask IDs, including ambiguous joined paths',()=>{
 const project=fixture();project.symbols[0].nodes[0].maskType='ellipse';project.symbols[0].nodes[0].glow=2;
 project.symbols[0].nodes[0].keyframes.push({frame:3,maskWidth:10,glow:4});
 for(const svg of [sceneToSVG(project,3),animatedSVG(project)]){
  const ids=[...svg.matchAll(/<(?:filter|clipPath) id="([^"]+)"/g)].map(match=>match[1]);
  assert.equal(ids.length,4);assert.equal(new Set(ids).size,4);
  const refs=[...svg.matchAll(/(?:filter|clip-path)="url\(#([^\)]+)\)"/g)].map(match=>match[1]);
  assert.deepEqual(new Set(refs),new Set(ids));
 }
 assert.notEqual(instancePrefix('test',['a-b','c']),instancePrefix('test',['a','b-c']));
 assert.notEqual(instancePrefix('test',['a','1-b']),instancePrefix('test',['a-1','b']));
});

test('each symbol camera samples at its own clock and single-frame instances stay still',()=>{
 const project=fixture();project.symbols[0].nodes=[{id:'mesh',type:'mesh',primitive:'box',width:50,height:50,fill:'#99eecc',rotationY:20}];
 project.symbols[0].camera={yaw:0,pitch:10,distance:1000,fov:45,keyframes:[{frame:4,yaw:70,easing:'linear'}]};
 project.nodes[1].playback='single';project.nodes[1].firstFrame=3;
 const p=validateProject(project),definition=p.symbols[0],svg=animatedSVG(p),groups=[...section(svg,'a/mesh').matchAll(/<g data-mesh-frame="(\d+)"[^>]*>([\s\S]*?)<\/g>/g)];
 assert.equal(groups.length,p.duration);
 for(let frame=0;frame<p.duration;frame++){
  const local=evaluateSymbolFrame(p.nodes[0],frame,definition),expected=meshPaths(definition.nodes[0],evaluateCamera(definition.camera,local)).map(face=>face.d);
  assert.deepEqual(geometryPaths(groups[frame][2]),expected);
 }
 assert.doesNotMatch(section(svg,'b/mesh'),/data-mesh-frame/);
 const expected=meshPaths(definition.nodes[0],evaluateCamera(definition.camera,3)).map(face=>face.d);
 assert.deepEqual(geometryPaths(section(svg,'b/mesh')),expected);
 assert.deepEqual(geometryPaths(section(sceneToSVG(p,9),'b/mesh')),expected);
});

test('nested animated output budgets charge every repeated instance before allocating samples',()=>{
 const p=fixture();p.duration=10000;p.nodes=Array.from({length:51},(_,i)=>symbol(`instance${i}`,'mark'));
 assert.throws(()=>animatedSVG(p),/500,000 layer-frame/);
 p.nodes=[symbol('a','mark')];p.duration=3000;p.symbols[0].duration=1000;p.symbols[0].nodes[0].keyframes=Array.from({length:1000},(_,i)=>({frame:i,x:i}));
 assert.throws(()=>animatedSVG(p),/evaluation budget/);
 p.duration=1100;p.symbols[0].duration=1100;p.symbols[0].nodes=[{id:'mesh',type:'mesh',primitive:'torus',width:50,height:50,keyframes:[{frame:1099,rotationY:80}]}];
 assert.throws(()=>animatedSVG(p),/200,000 triangle-frame/);
 p.duration=600;p.symbols[0].duration=600;p.symbols[0].nodes[0].keyframes[0].frame=599;
 assert.throws(()=>animatedSVG(p),/16 MB output budget/);
});

test('still export rejects large expanded path payloads before string assembly',()=>{
 const p=fixture();p.nodes=Array.from({length:340},(_,i)=>symbol(`instance${i}`,'mark'));
 p.symbols[0].nodes=[{id:'path',type:'path',d:'M0 0'+' L1 1'.repeat(9999),width:100,height:100}];
 assert.throws(()=>sceneToSVG(p),/16 MB output budget/);
 assert.throws(()=>animatedSVG(p),/16 MB output budget/);
});

test('animated size, ancestor transform and local mask tracks retain independent coordinate spaces',()=>{
 const p=fixture();p.nodes=[{...p.nodes[0],keyframes:[{frame:11,width:400,height:100,rotation:90,easing:'linear'}]}];
 p.symbols[0].nodes[0].maskType='rect';p.symbols[0].nodes[0].maskWidth=0;
 p.symbols[0].nodes[0].keyframes=[{frame:4,x:80,maskWidth:30,maskRotation:60,easing:'linear'}];
 const clean=validateProject(p),svg=animatedSVG(clean),scaleTrack=values(section(svg,'a'),'scale'),rotation=values(section(svg,'a'),'rotate');
 const clip=svg.match(/<clipPath\b[\s\S]*?<\/clipPath>/)[0],widths=clip.match(/attributeName="width" values="([^"]+)"/)[1].split(';');
 for(const frame of [0,3,7,11]){
  const parent=evaluateNode(clean.nodes[0],frame),local=evaluateSymbolFrame(parent,frame,clean.symbols[0]),child=evaluateNode(clean.symbols[0].nodes[0],local);
  const expectedScale=[parent.width/100,parent.height/100];
  scaleTrack[frame].split(' ').forEach((value,index)=>assert.ok(Math.abs(Number(value)-expectedScale[index])<1e-9));
  assert.equal(Number(rotation[frame].split(' ')[0]),Math.round(parent.rotation*1000)/1000);
  assert.equal(Number(widths[frame]),child.maskWidth);
 }
});

test('static symbols avoid animation and hierarchy keeps scalar animation compact',()=>{
 const p=fixture();p.symbols[0].nodes[0].keyframes=[];
 assert.equal(animatedSVG(p),sceneToSVG(p,0));
 p.nodes[0].keyframes=[{frame:11,rotation:90}];
 const svg=animatedSVG(p);
 assert.equal((svg.match(/data-symbol-content=/g)||[]).length,2);
 assert.equal((svg.match(/data-instance-path="a\/leaf"/g)||[]).length,1);
 assert.doesNotMatch(svg,/data-mesh-frame/);
});

test('JSON and embed exports preserve the v2 symbol library and HTML contains nested animation',async()=>{
 const p=fixture(),snippet=embedCode(p,{baseURL:'https://example.org/Rash/'}),data=snippet.match(/<script type="application\/json">([\s\S]*?)<\/script>/)[1];
 const recovered=JSON.parse(data);assert.equal(recovered.version,2);assert.deepEqual(recovered.symbols,p.symbols);
 const json=JSON.parse(await (await exportProject(p,'json')).blob.text());assert.deepEqual(json.symbols,p.symbols);
 const html=await (await exportProject(p,'html')).blob.text();assert.match(html,/data-instance-path="a\/leaf"/);assert.match(html,/<animateTransform/);
});

test('all six legacy example animations and posters remain byte identical',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../web/examples/manifest.json',import.meta.url),'utf8'));
 for(const example of manifest.examples){
  const project=JSON.parse(await readFile(new URL(`../web/examples/${example.id}.rash.json`,import.meta.url),'utf8'));
  assert.equal(animatedSVG(project)+'\n',await readFile(new URL(`../web/examples/${example.id}.svg`,import.meta.url),'utf8'),example.id);
  assert.equal(sceneToSVG(project,example.posterFrame)+'\n',await readFile(new URL(`../web/examples/${example.id}.poster.svg`,import.meta.url),'utf8'),`${example.id} poster`);
 }
});

// A minimal retained DOM verifies element identity and cleanup independently of
// browser screenshot tests. Real rendering and hit testing run in symbol UI E2E.
class Element{
 constructor(tag){this.tagName=tag;this.children=[];this.attributes=new Map();this.parentNode=null;}
 setAttribute(k,v){this.attributes.set(k,String(v));}getAttribute(k){return this.attributes.get(k)??null;}removeAttribute(k){this.attributes.delete(k);}
 append(...nodes){for(const node of nodes){node.remove();node.parentNode=this;this.children.push(node);}}
 remove(){if(this.parentNode){const siblings=this.parentNode.children;siblings.splice(siblings.indexOf(this),1);this.parentNode=null;}}
 replaceChildren(...nodes){for(const child of [...this.children])child.remove();this.append(...nodes);}
 insertBefore(node,before){node.remove();node.parentNode=this;this.children.splice(before?this.children.indexOf(before):this.children.length,0,node);}
}
const descendants=node=>[node,...node.children.flatMap(descendants)];
const at=(svg,path)=>descendants(svg).find(node=>node.getAttribute('data-instance-path')===path);

test('retained symbols update both shared instances, preserve identity, select outer instance and clean removed definitions',()=>{
 const previous=globalThis.document;globalThis.document={createElementNS:(_,tag)=>new Element(tag)};
 try{
  const p=fixture(),svg=new Element('svg'),second=new Element('svg'),selected=[];
  p.symbols[0].nodes[0].maskType='rect';p.symbols[0].nodes[0].glow=2;
  renderScene(svg,p,0,{onSelect:id=>selected.push(id)});renderScene(second,p,0);
  const leaf=at(svg,'a/leaf'),other=at(svg,'b/leaf');assert.ok(leaf);assert.ok(other);
  leaf.onclick({stopPropagation(){}});assert.deepEqual(selected,['a']);assert.equal(leaf.getAttribute('data-node-id'),'a');
  assert.notEqual(leaf.getAttribute('clip-path'),other.getAttribute('clip-path'));
  assert.notEqual(leaf.getAttribute('clip-path'),at(second,'a/leaf').getAttribute('clip-path'));
  p.symbols[0].nodes[0].fill='#112233';renderScene(svg,p,3);
  assert.equal(at(svg,'a/leaf'),leaf);assert.equal(at(svg,'b/leaf'),other);
  for(const node of [leaf,other])assert.equal(node.children[0].getAttribute('fill'),'#112233');
  assert.match(leaf.getAttribute('transform'),/^translate\(60 10\)/);
  p.symbols[0].nodes[0].visible=false;renderScene(svg,p,3);assert.equal(leaf.getAttribute('display'),'none');
  p.nodes.splice(0,1);renderScene(svg,p,3);assert.equal(at(svg,'a/leaf'),undefined);assert.equal(leaf.parentNode,null);
  assert.equal(descendants(svg).filter(node=>node.tagName==='filter').length,1);assert.equal(descendants(svg).filter(node=>node.tagName==='clipPath').length,1);
  p.symbols[0].nodes=[];renderScene(svg,p,3);assert.equal(at(svg,'b/leaf'),undefined);
  assert.equal(descendants(svg).filter(node=>['filter','clipPath'].includes(node.tagName)).length,0);
 }finally{globalThis.document=previous;}
});

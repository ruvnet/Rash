import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ANIMATED_PROPERTIES,DEFAULT_CAMERA,MAX_SYMBOL_DEPTH,createProject,normalizeNode,validateProject,serializeProject,parseProject,cloneProject,evaluateNode,evaluateScene,evaluateSymbolFrame} from '../web/core/model.js';
import {createSymbol,addSymbolInstance,convertNodesToSymbol,removeSymbolDefinition} from '../web/core/symbols.js';

const shape=(id='shape',extra={})=>normalizeNode({id,type:'rect',x:20,y:30,width:100,height:60,fill:'#ff6b35',...extra});
const instance=(id='instance',symbolId='graphic',extra={})=>normalizeNode({id,type:'symbol',symbolId,width:100,height:60,...extra});
const definition=(id='graphic',nodes=[shape()],extra={})=>({id,name:id,width:100,height:60,duration:30,camera:{...DEFAULT_CAMERA,keyframes:[]},nodes,...extra});
const project=(symbols=[definition()],nodes=[instance()])=>({...createProject('blank'),version:2,symbols,nodes});
const repeated=(count,child=shape(),size={})=>project([definition('graphic',[child],size)],Array.from({length:count},(_,index)=>instance(`i${index}`,'graphic',size)));

function unchangedOnThrow(p,fn,match){const before=JSON.stringify(p);assert.throws(fn,match);assert.equal(JSON.stringify(p),before);}

test('legacy documents preserve their shape; symbols require an explicit version2 library',()=>{
 const p=createProject('orbit');assert.deepEqual(parseProject(serializeProject(p)),p);assert.equal(Object.hasOwn(p,'symbols'),false);
 assert.throws(()=>validateProject({...p,symbols:[definition()]}),/version 2/);
 assert.throws(()=>validateProject({...p,nodes:[instance()]}),/version 2/);
 assert.throws(()=>validateProject({...p,version:2}),/symbols array/);
 const empty=validateProject({...p,version:2,symbols:[]});assert.deepEqual(empty.symbols,[]);assert.equal(empty.version,2);
});

test('local clocks loop, stop once, hold one frame and hold firstFrame before their start',()=>{
 const symbol=definition('graphic',[],{duration:10});
 const loop=instance('loop','graphic',{startFrame:5,firstFrame:3});
 assert.equal(evaluateSymbolFrame(loop,0,symbol),3);assert.equal(evaluateSymbolFrame(loop,5,symbol),3);
 assert.equal(evaluateSymbolFrame(loop,13,symbol),1);assert.equal(evaluateSymbolFrame(loop,13.5,symbol),1.5);
 assert.equal(evaluateSymbolFrame({...loop,playback:'once'},100,symbol),9);
 assert.equal(evaluateSymbolFrame({...loop,playback:'single'},100,symbol),3);
 assert.equal(evaluateSymbolFrame({...loop,playback:'single',firstFrame:40},100,symbol),9);
 assert.equal(evaluateSymbolFrame({...loop,firstFrame:40},0,symbol),0);
 const child=definition('child',[],{duration:4});
 assert.equal(evaluateSymbolFrame(instance('nested','child',{firstFrame:2}),evaluateSymbolFrame(loop,13,symbol),child),3);
 const movieclip=instance('clip','graphic',{playback:'movieclip',startFrame:5,firstFrame:3});
 assert.equal(evaluateSymbolFrame(movieclip,0,symbol,13),1,'MovieClip reads the root transport instead of its parent frame');
 assert.equal(evaluateSymbolFrame(movieclip,99,symbol,25),3,'MovieClip keeps phase across a root timeline loop');
});

test('symbol instances normalize strict identity and clock fields',()=>{
 for(const extra of [{firstFrame:-1},{firstFrame:.5},{startFrame:Infinity},{startFrame:36001},{playback:'independent'},{symbolId:'bad id'}])assert.throws(()=>validateProject(project([definition()],[{...instance(),...extra}])));
 assert.equal(validateProject(project([definition()],[instance('clip','graphic',{playback:'movieclip'})])).nodes[0].playback,'movieclip');
 const p=validateProject(project());assert.equal(p.nodes[0].playback,'loop');assert.equal(p.nodes[0].startFrame,0);
});

test('round trips retain shared symbol identity and per instance transforms',()=>{
 const p=repeated(2);p.nodes[1].x=300;p.nodes[1].firstFrame=12;
 const roundTrip=parseProject(serializeProject(p));assert.deepEqual(roundTrip,validateProject(p));
 assert.equal(roundTrip.symbols.length,1);assert.equal(roundTrip.nodes[0].symbolId,roundTrip.nodes[1].symbolId);
 const copy=cloneProject(roundTrip);copy.symbols[0].nodes[0].fill='#00ff00';
 assert.equal(copy.symbols.find(s=>s.id===copy.nodes[0].symbolId).nodes[0].fill,'#00ff00');
 assert.equal(copy.symbols.find(s=>s.id===copy.nodes[1].symbolId).nodes[0].fill,'#00ff00');
 assert.equal(roundTrip.symbols[0].nodes[0].fill,'#ff6b35');
 assert.equal(evaluateScene(roundTrip,15).length,2);assert.equal(evaluateScene(roundTrip,15)[0].type,'symbol');
});

test('missing definitions, duplicate definition IDs and local duplicate layer IDs reject',()=>{
 assert.throws(()=>validateProject(project([])),/Missing symbol/);
 assert.throws(()=>validateProject(project([definition(),definition()])),/Symbol IDs must be unique/);
 assert.throws(()=>validateProject(project([definition('graphic',[shape(),shape()])])),/Layer IDs must be unique/);
 // Identical layer IDs in independent scopes are permitted, as are root and local IDs.
 assert.doesNotThrow(()=>validateProject(project([definition(),definition('other')],[shape(),instance()])));
 assert.throws(()=>validateProject(project([definition(),definition('unused',[instance('bad','missing')])])),/Missing symbol/);
});

test('cycles reject even in an unused library branch',()=>{
 assert.throws(()=>validateProject(project([definition('graphic',[instance('self')])],[])),/cycles/);
 assert.throws(()=>validateProject(project([definition('a',[instance('toB','b')]),definition('b',[instance('toA','a')])],[])),/cycles/);
});

test('nesting is limited to eight definitions without allocating expanded trees',()=>{
 const chain=count=>Array.from({length:count},(_,index)=>definition(`s${index}`,index===count-1?[shape()]:[instance(`ref${index}`,`s${index+1}`)]));
 assert.doesNotThrow(()=>validateProject(project(chain(MAX_SYMBOL_DEPTH),[instance('root','s0')])));
 assert.throws(()=>validateProject(project(chain(MAX_SYMBOL_DEPTH+1),[instance('root','s0')])),/depth of 8/);
 const doubling=Array.from({length:8},(_,index)=>definition(`s${index}`,index===7?[shape()]:Array.from({length:3},(_,j)=>instance(`ref${j}`,`s${index+1}`))));
 assert.throws(()=>validateProject(project(doubling,[instance('root','s0')])),/layers/);
});

test('stored and expanded node budgets include repeated and disconnected library content',()=>{
 assert.throws(()=>validateProject(repeated(501)),/layers/);
 const unused=Array.from({length:3},(_,i)=>definition(`s${i}`,Array.from({length:334},(_,j)=>shape(`n${j}`))));
 assert.throws(()=>validateProject(project(unused,[])),/stored layers/);
 // Three disconnected roots reuse a common 200 layer definition; each subtree is bounded,
 // but their combined document expansion is 3 * (2 + 400) layers.
 const shared=definition('shared',Array.from({length:200},(_,i)=>shape(`s${i}`)));
 const roots=Array.from({length:3},(_,i)=>definition(`root${i}`,[instance('a','shared'),instance('b','shared')]));
 assert.throws(()=>validateProject(project([shared,...roots],[])),/layers/);
});

test('3D instance counts, triangle totals and unused library meshes are bounded',()=>{
 assert.throws(()=>validateProject(repeated(33,shape('mesh',{type:'mesh',primitive:'box'}))),/3D layers/);
 assert.throws(()=>validateProject(repeated(22,shape('mesh',{type:'mesh',primitive:'torus'}))),/3D triangles/);
 const unused=Array.from({length:33},(_,i)=>definition(`s${i}`,[shape('mesh',{type:'mesh',primitive:'box'})]));
 assert.throws(()=>validateProject(project(unused,[])),/3D layers/);
});

test('expanded text, keyframe and property timing budgets count every instance',()=>{
 assert.throws(()=>validateProject(repeated(100,shape('text',{type:'text',text:'x\n'.repeat(101)}))),/text lines/);
 const keyed=shape('keyed',{keyframes:Array.from({length:100},(_,frame)=>({frame,x:frame}))});
 assert.throws(()=>validateProject(repeated(101,keyed)),/keyframes/);
 const curves=Object.fromEntries(ANIMATED_PROPERTIES.map(property=>[property,{easing:'linear'}]));
 const timed=shape('timed',{keyframes:Array.from({length:10},(_,frame)=>({frame,x:frame,curves}))});
 assert.throws(()=>validateProject(repeated(Math.ceil(20000/(10*ANIMATED_PROPERTIES.length))+1,timed)),/timing overrides/);
 const p=repeated(101);p.symbols[0].camera.keyframes=Array.from({length:100},(_,frame)=>({frame,yaw:frame}));
 assert.throws(()=>validateProject(p),/keyframes/);
});

test('all descendant effect budgets count repetitions and ancestor scale envelopes',()=>{
 assert.throws(()=>validateProject(repeated(65,shape('glow',{glow:1}))),/layers with blur or glow/);
 assert.throws(()=>validateProject(repeated(18,shape('glow',{glow:1,width:1000,height:1000}),{width:1000,height:1000})),/32 million/);
 const p=project([definition('graphic',[shape('blur',{blur:2})])],[instance('large','graphic',{scale:10})]);
 assert.throws(()=>validateProject(p),/16 million/);
 p.nodes[0].scale=1;p.nodes[0].keyframes=[{frame:20,width:1000}];assert.throws(()=>validateProject(p),/16 million/);
 const nested=project([definition('inner',[shape('blur',{blur:1})]),definition('graphic',[instance('nested','inner',{scale:3})])],[instance('outer','graphic',{scale:4})]);
 assert.throws(()=>validateProject(nested),/16 million/);
});

test('symbol instance effects reject while opacity, masks and animated dimensions remain supported',()=>{
 for(const extra of [{blur:1},{glow:1},{keyframes:[{frame:10,glow:2}]}])assert.throws(()=>validateProject(project([definition()],[instance('bad','graphic',extra)])),/not supported on symbol instances/);
 const valid=project([definition()],[instance('masked','graphic',{maskType:'ellipse',opacity:.5,keyframes:[{frame:10,width:200,maskWidth:150}]})]);
 assert.equal(validateProject(valid).nodes[0].maskType,'ellipse');
});

test('conversion preserves positions, masks and animation across the complete original timeline',()=>{
 const p=createProject('blank');p.duration=80;
 p.nodes=[shape('a',{x:-20,y:30,maskType:'rect',maskX:5,keyframes:[{frame:0,x:-20,y:30},{frame:40,x:200,y:60,easing:'linear'}]}),shape('b',{x:160,y:70,rotation:40,scale:1.2})];
 const before=cloneProject(p),result=convertNodesToSymbol(p,['a','b'],'Pair');
 assert.deepEqual(Object.keys(result).sort(),['instanceId','symbolId']);assert.equal(p.version,2);
 const def=p.symbols[0],container=p.nodes[0];assert.equal(def.id,result.symbolId);assert.equal(container.id,result.instanceId);
 assert.deepEqual(def.camera,before.camera);assert.equal(def.duration,before.duration);assert.deepEqual(def.nodes.map(n=>n.id),['a','b']);
 for(let frame=0;frame<p.duration;frame++)for(let index=0;index<2;index++){
  const original=evaluateNode(before.nodes[index],frame),local=evaluateNode(def.nodes[index],evaluateSymbolFrame(container,frame,def));
  assert.ok(Math.abs(original.x-(local.x+container.x))<1e-8);assert.ok(Math.abs(original.y-(local.y+container.y))<1e-8);
  for(const property of ['width','height','rotation','scale','maskX','maskWidth','fill'])assert.equal(local[property],original[property]);
 }
 assert.deepEqual(parseProject(serializeProject(p)),p);
});

test('single layer conversion and adding nested instances keep shared definitions',()=>{
 const p=createProject('blank');p.nodes=[shape('original')];
 const {symbolId:first}=convertNodesToSymbol(p,['original'],'First');
 const second=createSymbol(p,'Second',{width:200,height:200,duration:15});
 const nested=addSymbolInstance(p,first,{scopeId:second,x:0,y:0});
 assert.equal(p.symbols.find(s=>s.id===second).nodes[0].id,nested);
 const result=convertNodesToSymbol(p,[nested],'Third',{scopeId:second});
 assert.equal(p.symbols.find(s=>s.id===second).nodes[0].symbolId,result.symbolId);
 assert.equal(p.symbols.find(s=>s.id===result.symbolId).nodes[0].symbolId,first);
 assert.doesNotThrow(()=>validateProject(p));
});

test('conversion rejects layer order changes, locked layers and lossy coordinate translation atomically',()=>{
 const p=createProject('blank');p.nodes=[shape('a'),shape('b'),shape('c')];
 unchangedOnThrow(p,()=>convertNodesToSymbol(p,[],'None'),/at least one/);
 unchangedOnThrow(p,()=>convertNodesToSymbol(p,['a','c'],'Separated'),/adjacent/);
 unchangedOnThrow(p,()=>convertNodesToSymbol(p,['missing'],'Missing'),/no longer exists/);
 p.nodes[0].locked=true;unchangedOnThrow(p,()=>convertNodesToSymbol(p,['a'],'Locked'),/Unlock/);
 p.nodes[0].locked=false;p.nodes[0].x=-100000;p.nodes[0].keyframes=[{frame:10,x:100000}];
 unchangedOnThrow(p,()=>convertNodesToSymbol(p,['a'],'Too wide'),/coordinate bounds/);
});

test('creating or inserting recursive or excessive instances is atomic',()=>{
 const p=validateProject(project());
 unchangedOnThrow(p,()=>addSymbolInstance(p,'graphic',{scopeId:'graphic'}),/cycles/);
 unchangedOnThrow(p,()=>addSymbolInstance(p,'missing'),/no longer exists/);
 unchangedOnThrow(p,()=>createSymbol(p,'Too wide',{width:10001}),/dimensions/);
 const full=validateProject(repeated(32,shape('mesh',{type:'mesh',primitive:'box'})));
 unchangedOnThrow(full,()=>addSymbolInstance(full,'graphic'),/3D layers/);
});

test('definitions cannot be removed while referenced, including references in unused symbols',()=>{
 const p=validateProject(project([definition(),definition('unused',[instance('nested')])],[]));
 unchangedOnThrow(p,()=>removeSymbolDefinition(p,'graphic'),/in use/);
 assert.equal(removeSymbolDefinition(p,'unused'),'unused');assert.equal(removeSymbolDefinition(p,'graphic'),'graphic');
 assert.deepEqual(p.symbols,[]);assert.equal(p.version,2);assert.doesNotThrow(()=>parseProject(serializeProject(p)));
});

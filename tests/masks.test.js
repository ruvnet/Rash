import test from 'node:test';
import assert from 'node:assert/strict';
import { ANIMATED_PROPERTIES, MASK_PROPERTIES, MASK_TYPES, createProject, addNode, normalizeNode, validateProject, serializeProject, parseProject, evaluateNode, setKeyframeTiming, keyframeTiming, fitNodeMask, removeNodeMask, filterSceneBounds, templates, presets } from '../web/core/model.js';
import { applyMotionPreset, motionPresets } from '../web/core/motion.js';

const masks=node=>Object.fromEntries(MASK_PROPERTIES.map(property=>[property,node[property]]));
const unrelated=node=>Object.fromEntries(ANIMATED_PROPERTIES.filter(property=>!MASK_PROPERTIES.includes(property)).map(property=>[property,node[property]]));
const samples=node=>Array.from({length:241},(_,index)=>unrelated(evaluateNode(node,index/2)));
const unchanged=(project,operation,message)=>{const before=JSON.stringify(project);assert.throws(operation,message);assert.equal(JSON.stringify(project),before);};

test('legacy layers acquire disabled local masks without changing their old motion or version',()=>{
  const project=validateProject({version:1,nodes:[{id:'legacy',width:320,height:180,keyframes:[{frame:0,x:0},{frame:30,x:100,easing:'linear'}]}]});
  const node=project.nodes[0];
  assert.equal(project.version,1);assert.equal(node.maskType,'none');
  assert.deepEqual(MASK_TYPES,['none','rect','ellipse']);assert.deepEqual(masks(node),{maskX:0,maskY:0,maskWidth:320,maskHeight:180,maskRotation:0});
  assert.equal(evaluateNode(node,15).x,50);assert.deepEqual(parseProject(serializeProject(project)),project);
  for(const property of MASK_PROPERTIES)assert.ok(ANIMATED_PROPERTIES.includes(property));
});

test('mask normalization permits a fully closed mask and discards executable and remote attributes',()=>{
  const source=JSON.parse('{"id":"hostile","maskType":"url(https://evil.test/mask)","maskX":999999,"maskY":-999999,"maskWidth":-1,"maskHeight":999999,"maskRotation":999999,"maskHref":"javascript:alert(1)","maskAttributes":{"onload":"alert(1)"},"__proto__":{"polluted":true},"keyframes":[{"frame":20,"maskWidth":0,"maskHeight":0,"maskHref":"https://evil.test","curves":{"maskWidth":{"easing":"javascript:alert(1)","onload":"evil"}}}]}');
  const node=normalizeNode(source);
  assert.equal(node.maskType,'none');assert.deepEqual(masks(node),{maskX:100000,maskY:-100000,maskWidth:0,maskHeight:10000,maskRotation:100000});
  assert.equal(evaluateNode(node,20).maskWidth,0);assert.equal(evaluateNode(node,20).maskHeight,0);
  assert.equal(Object.hasOwn(node,'maskHref'),false);assert.equal(Object.hasOwn(node,'maskAttributes'),false);
  assert.doesNotMatch(JSON.stringify(node),/evil|javascript|polluted/);assert.equal({}.polluted,undefined);
  const invalid=normalizeNode({width:400,height:200,maskType:'ellipse',maskWidth:NaN,maskHeight:Infinity,maskX:'9',maskRotation:{value:20}});
  assert.deepEqual(masks(invalid),{maskX:0,maskY:0,maskWidth:400,maskHeight:200,maskRotation:0});
});

test('mask fields interpolate independently, support zero and stay bounded under expressive timing',()=>{
  const node=normalizeNode({id:'mask',maskType:'rect',keyframes:[{frame:0,maskX:-100000,maskY:100000,maskWidth:0,maskHeight:0,maskRotation:0,opacity:0},{frame:60,maskX:100000,maskY:-100000,maskWidth:10000,maskHeight:10000,maskRotation:100000,opacity:1,easing:'linear'}]});
  setKeyframeTiming(node.keyframes[1],'maskWidth',{easing:'easeOut'});
  assert.equal(evaluateNode(node,30).maskWidth,7500);assert.equal(evaluateNode(node,30).opacity,.5);
  setKeyframeTiming(node.keyframes[1],'maskHeight',{easing:'bezier',bezier:[0,3,1,3]});
  setKeyframeTiming(node.keyframes[1],'maskRotation',{easing:'elastic'});
  for(let frame=0;frame<=60;frame+=.25){const value=evaluateNode(node,frame);assert.ok(value.maskWidth>=0&&value.maskWidth<=10000);assert.ok(value.maskHeight>=0&&value.maskHeight<=10000);assert.ok(Math.abs(value.maskRotation)<=100000);}
  assert.equal(evaluateNode(node,0).maskWidth,0);assert.deepEqual(keyframeTiming(node.keyframes[1],'opacity'),{easing:'linear'});
});

test('fit at frame zero updates base and existing zero mask values while preserving shape and unrelated keys',()=>{
  const project=createProject('blank'),node=addNode(project);node.maskType='ellipse';
  Object.assign(node,{maskX:34,maskY:90,maskRotation:70});
  node.keyframes=[{frame:0,width:240,height:180,rotation:30,maskWidth:20,curves:{rotation:{easing:'step'},maskWidth:{easing:'linear'}}},{frame:90,rotation:100,easing:'bezier',bezier:[.2,-1,.8,2]}];
  const expected=samples(node),later=structuredClone(node.keyframes[1]);
  const result=fitNodeMask(project,node.id);
  assert.equal(result,project.nodes[0]);assert.equal(result.maskType,'ellipse');assert.deepEqual(masks(result),{maskX:0,maskY:0,maskWidth:240,maskHeight:180,maskRotation:0});
  assert.deepEqual(masks(result.keyframes[0]),masks(result));assert.deepEqual(result.keyframes[1],later);assert.deepEqual(samples(result),expected);
  assert.deepEqual(result.keyframes[0].curves,{rotation:{easing:'step'},maskWidth:{easing:'linear'}});
});

test('fit at later frames authors sparse evaluated dimensions without changing unrelated sampled tracks',()=>{
  const project=createProject('blank'),node=addNode(project);
  node.keyframes=[{frame:0,width:200,height:100,opacity:.2,rotation:0},{frame:60,width:400,height:300,opacity:1,rotation:90,easing:'linear',curves:{opacity:{easing:'easeOut'}}}];
  const expected=samples(node),base=masks(node);
  let result=fitNodeMask(project,node.id,30);
  assert.equal(result.maskType,'rect');assert.deepEqual(masks(result),base);
  assert.deepEqual(masks(result.keyframes.find(key=>key.frame===30)),{maskX:0,maskY:0,maskWidth:300,maskHeight:200,maskRotation:0});
  assert.deepEqual(samples(result),expected);
  result=fitNodeMask(project,node.id,60);
  const end=result.keyframes.find(key=>key.frame===60);
  assert.equal(end.maskWidth,400);assert.equal(end.maskHeight,300);assert.equal(end.easing,'linear');assert.deepEqual(end.curves.opacity,{easing:'easeOut'});assert.deepEqual(samples(result),expected);
});

test('remove clears only mask keys and mask curves, retaining unrelated animation and base dimensions',()=>{
  const project=createProject('blank'),node=addNode(project);node.maskType='ellipse';
  node.keyframes=[{frame:0,maskWidth:0,maskHeight:0},{frame:30,maskWidth:200,rotation:45,easing:'linear',curves:{maskWidth:{easing:'easeOut'},rotation:{easing:'bezier',bezier:[.1,0,.8,1]}}},{frame:60,maskRotation:90,curves:{maskRotation:{easing:'linear'}}},{frame:120,opacity:.5,easing:'step',curves:{maskHeight:{easing:'easeOut'}}}];
  const before=structuredClone(project),expected=samples(node),base=masks(node);
  const result=removeNodeMask(project,node.id);
  assert.equal(result.maskType,'none');assert.deepEqual(masks(result),base);assert.deepEqual(result.keyframes.map(key=>key.frame),[30,120]);
  assert.deepEqual(result.keyframes[0].curves,{rotation:{easing:'bezier',bezier:[.1,0,.8,1]}});assert.equal(Object.hasOwn(result.keyframes[1],'curves'),false);
  assert.deepEqual(samples(result),expected);assert.deepEqual(parseProject(serializeProject(project)),project);
  assert.equal(before.nodes[0].maskType,'ellipse');assert.equal(before.nodes[0].keyframes.length,4);
});

test('mask authoring rejects locked, missing, out of timeline and oversized input atomically',()=>{
  const project=createProject('blank'),node=addNode(project);node.locked=true;
  unchanged(project,()=>fitNodeMask(project,node.id),/Unlock/);unchanged(project,()=>removeNodeMask(project,node.id),/Unlock/);
  node.locked=false;
  unchanged(project,()=>fitNodeMask(project,'missing'),/no longer exists/);unchanged(project,()=>removeNodeMask(project,'missing'),/no longer exists/);
  for(const frame of [-1,240,Infinity,NaN])unchanged(project,()=>fitNodeMask(project,node.id,frame),/within the composition timeline/);
  node.width=10001;unchanged(project,()=>fitNodeMask(project,node.id),/10,000 pixel size limit/);
});

test('fit and reveal presets enforce both layer and aggregate key budgets without partial authoring',()=>{
  const project=createProject('blank'),node=addNode(project);project.duration=3000;
  node.keyframes=Array.from({length:1000},(_,frame)=>({frame,rotation:frame}));
  unchanged(project,()=>fitNodeMask(project,node.id,1500),/1,000 keyframe layer limit/);
  for(const preset of ['wipeReveal','irisReveal'])unchanged(project,()=>applyMotionPreset(project,node.id,preset,{startFrame:1500,durationFrames:30}),/1,000 keyframe layer limit/);
  project.nodes=Array.from({length:10},(_,index)=>normalizeNode({id:`full${index}`,keyframes:Array.from({length:1000},(_,frame)=>({frame,x:frame}))}));
  const extra=addNode(project);
  unchanged(project,()=>fitNodeMask(project,extra.id,20),/10,000 keyframes/);
  unchanged(project,()=>applyMotionPreset(project,extra.id,'wipeReveal'),/10,000 keyframes/);
});

test('wipe and iris presets author only mask tracks and preserve every unrelated sampled property',()=>{
  for(const preset of ['wipeReveal','irisReveal']){
    const project=createProject('blank'),node=addNode(project);
    node.keyframes=[{frame:0,width:180,height:100,x:30,rotation:0,opacity:.2},{frame:60,width:400,height:200,x:130,rotation:90,opacity:1,easing:'linear',curves:{opacity:{easing:'easeOut'},rotation:{easing:'bezier',bezier:[.2,-.5,.8,1.5]}}}];
    const expected=samples(node);
    applyMotionPreset(project,node.id,preset,{durationFrames:60});
    const result=project.nodes[0],first=evaluateNode(result,0),end=evaluateNode(result,60);
    assert.equal(result.maskType,preset==='wipeReveal'?'rect':'ellipse');assert.equal(first.maskWidth,0);assert.deepEqual(samples(result),expected);
    assert.equal(end.maskRotation,0);assert.deepEqual(keyframeTiming(result.keyframes.find(key=>key.frame===60),'opacity'),{easing:'easeOut'});
    if(preset==='wipeReveal'){assert.equal(end.maskWidth,400);assert.equal(end.maskHeight,200);}
    else{
      assert.equal(first.maskHeight,0);assert.equal(end.maskWidth,400*Math.SQRT2);assert.equal(end.maskHeight,200*Math.SQRT2);
      assert.equal(end.maskX+end.maskWidth/2,200);assert.equal(end.maskY+end.maskHeight/2,100);
      const corner=(200/(end.maskWidth/2))**2+(100/(end.maskHeight/2))**2;assert.ok(Math.abs(corner-1)<1e-12);
    }
    assert.deepEqual(parseProject(serializeProject(project)),project);
  }
});

test('mask timing overrides count toward the shared scene budget and oversized presets roll back',()=>{
  const project=createProject('blank');project.duration=2000;
  const curves=Object.fromEntries(MASK_PROPERTIES.map(property=>[property,{easing:'linear'}]));
  project.nodes=Array.from({length:4},(_,index)=>normalizeNode({id:`timing${index}`,keyframes:Array.from({length:1000},(_,frame)=>({frame,maskWidth:100,curves}))}));
  assert.doesNotThrow(()=>validateProject(project));
  const extra=addNode(project);
  unchanged(project,()=>applyMotionPreset(project,extra.id,'wipeReveal'),/20,000 property timing overrides/);
  extra.keyframes=[{frame:0,maskWidth:10,curves:{maskWidth:{easing:'linear'}}}];
  assert.throws(()=>validateProject(project),/20,000 property timing overrides/);
});

test('staggered masks hold their closed initial pose and multi layer oversized reveals are atomic',()=>{
  const project=createProject('blank'),a=addNode(project),b=addNode(project);
  applyMotionPreset(project,[a.id,b.id],'irisReveal',{startFrame:10,durationFrames:30,stagger:10});
  assert.equal(evaluateNode(project.nodes[1],19).maskWidth,0);assert.ok(evaluateNode(project.nodes[1],21).maskWidth>0);
  project.nodes[1].width=8000;
  unchanged(project,()=>applyMotionPreset(project,[a.id,b.id],'irisReveal'),/10,000 pixel size limit/);
  project.nodes[1].width=200;project.nodes[1].locked=true;
  unchanged(project,()=>applyMotionPreset(project,[a.id,b.id],'wipeReveal'),/Unlock/);
  unchanged(project,()=>applyMotionPreset(project,[a.id,'missing'],'wipeReveal'),/no longer exists/);
});

test('fully closed masks cannot reduce conservative effect allocation or bypass validation',()=>{
  const project=createProject('blank'),node=addNode(project);
  Object.assign(node,{width:8000,height:8000,maskType:'rect',maskWidth:0,maskHeight:0,glow:1});
  const plain={...node,maskType:'none'};
  assert.deepEqual(filterSceneBounds(node,project.camera),filterSceneBounds(plain,project.camera));
  assert.throws(()=>validateProject(project),/filter budget/);
  unchanged(project,()=>fitNodeMask(project,node.id),/filter budget/);unchanged(project,()=>removeNodeMask(project,node.id),/filter budget/);
  unchanged(project,()=>applyMotionPreset(project,node.id,'wipeReveal'),/filter budget/);
  project.nodes=[normalizeNode({id:'near',type:'mesh',width:1500,height:1500,glow:1,maskType:'ellipse',maskWidth:0,maskHeight:0})];
  assert.throws(()=>validateProject(project),/camera safety region/);
});

test('mask reveal template and both presets are available at every composition size',()=>{
  assert.ok(templates.some(template=>template.id==='mask'&&template.name==='Mask reveal'));
  for(const id of ['wipeReveal','irisReveal'])assert.ok(motionPresets.some(preset=>preset.id===id));
  for(const preset of presets){
    const project=createProject('mask',preset.id),masked=project.nodes.filter(node=>node.maskType!=='none');
    assert.equal(masked.length,3);assert.ok(masked.some(node=>node.type==='text'));assert.ok(masked.some(node=>node.type==='mesh'));
    for(const node of masked){assert.equal(evaluateNode(node,0).maskWidth,0);assert.ok(evaluateNode(node,120).maskWidth>0);}
    assert.deepEqual(parseProject(serializeProject(project)),project);
  }
});

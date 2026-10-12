import test from 'node:test';
import assert from 'node:assert/strict';
import { ANIMATED_PROPERTIES, createProject, addNode, addKeyframe, normalizeNode, validateProject, parseProject, serializeProject, evaluateNode, ease, MESH_TRIANGLES, MAX_MESHES, MAX_MESH_TRIANGLES } from '../web/core/model.js';
import { motionPresets, applyMotionPreset } from '../web/core/motion.js';
import { animatedSVG } from '../web/export/svg.js';
import { sceneToSVG } from '../web/core/renderer.js';

test('legacy projects keep schema version one and acquire bounded camera and effect defaults',()=>{
  const legacy={version:1,nodes:[{id:'shape',type:'rect',x:20}]};
  const project=validateProject(legacy);
  assert.deepEqual(project.camera,{yaw:0,pitch:0,distance:800,fov:45});
  assert.equal(project.nodes[0].blur,0);assert.equal(project.nodes[0].glow,0);assert.equal(project.nodes[0].blendMode,'normal');
  assert.equal(project.version,1);
});

test('3D fields, effect tracks, camera and custom curves survive serialized project roundtrips',()=>{
  const project=createProject('dimension');
  project.camera={yaw:22,pitch:-16,distance:1100,fov:60};
  const mesh=project.nodes.find(n=>n.type==='mesh');
  Object.assign(mesh,{rotationX:45,rotationY:-90,z:125,wireframe:true,blur:2,glow:12,blendMode:'screen'});
  mesh.keyframes.push({frame:20,z:220,blur:15,glow:25,easing:'bezier',bezier:[.16,1,.3,1]});
  assert.deepEqual(parseProject(serializeProject(project)),validateProject(project));
  assert.equal(ANIMATED_PROPERTIES.includes('rotationY'),true);assert.equal(ANIMATED_PROPERTIES.includes('glow'),true);
});

test('camera, primitive, effects and custom curve bounds reject active content and nonfinite numbers',()=>{
  const project=createProject('blank');
  project.camera={yaw:999,pitch:-999,distance:Infinity,fov:-100};
  project.nodes=[{id:'mesh',type:'mesh',width:20,height:20,primitive:'__proto__',rotationX:NaN,z:999,blur:Infinity,glow:999,blendMode:'url(https://evil.test)',keyframes:[{frame:10,z:-999,blur:-30,glow:999,easing:'bezier',bezier:[-50,Infinity,50,99]}]}];
  const clean=validateProject(project),node=clean.nodes[0];
  assert.deepEqual(clean.camera,{yaw:180,pitch:-180,distance:800,fov:20});
  assert.equal(node.primitive,'box');assert.equal(node.z,300);assert.equal(node.blur,0);assert.equal(node.glow,30);assert.equal(node.blendMode,'normal');
  assert.deepEqual(node.keyframes[0].bezier,[0,.1,1,3]);
  assert.equal(node.keyframes[0].z,-300);assert.equal(node.keyframes[0].blur,0);assert.equal(node.keyframes[0].glow,30);
  assert.doesNotMatch(animatedSVG(clean),/NaN|Infinity|evil\.test/);
});

test('Bezier inversion matches linear curves, expressive easing stays finite and constrained properties remain bounded',()=>{
  for(let i=0;i<=100;i++){
    const t=i/100;assert.ok(Math.abs(ease(t,'bezier',[0,0,1,1])-t)<1e-6);
    for(const kind of ['bezier','bounce','elastic'])assert.ok(Number.isFinite(ease(t,kind,[1,-2,0,3])));
  }
  assert.ok(ease(.5,'bezier',[.16,1,.3,1])>.9);
  assert.ok(ease(.15,'elastic')>1);
  const node=normalizeNode({id:'bounds',type:'mesh',keyframes:[{frame:0,opacity:0,width:1,blur:0,glow:0,z:-300},{frame:100,opacity:1,width:10000,blur:30,glow:30,z:300,easing:'bezier',bezier:[0,3,1,3]}]});
  for(let frame=0;frame<=100;frame++){
    const sample=evaluateNode(node,frame);
    assert.ok(sample.opacity>=0&&sample.opacity<=1);assert.ok(sample.width>=1&&sample.width<=10000);
    assert.ok(sample.blur>=0&&sample.blur<=30);assert.ok(sample.glow>=0&&sample.glow<=30);assert.ok(sample.z>=-300&&sample.z<=300);
  }
});

test('presets produce editable keys and preserve unrelated animation properties',()=>{
  for(const preset of motionPresets){
    const project=createProject('blank'),node=addNode(project,preset.meshOnly?'mesh':'rect');
    node.keyframes=[{frame:15,rotation:47,easing:'linear'}];
    const before={...node};
    assert.deepEqual(applyMotionPreset(project,node.id,preset.id,{durationFrames:60}),[node.id]);
    const changed=project.nodes[0];
    assert.equal(changed.keyframes.find(k=>k.frame===15).rotation,47);
    assert.ok(changed.keyframes.some(k=>k.frame===0));assert.ok(changed.keyframes.some(k=>k.frame===60));
    const first=evaluateNode(changed,0),last=evaluateNode(changed,60);
    if(preset.id==='spin3d')assert.equal(last.rotationY-first.rotationY,360);
    if(['fadeIn','slideUp','pop','blurReveal'].includes(preset.id)){assert.equal(first.opacity,0);assert.equal(last.opacity,before.opacity);}
    if(preset.id==='float'){assert.ok(evaluateNode(changed,30).y<first.y);assert.equal(last.y,first.y);}
    if(preset.id==='blurReveal'){assert.equal(first.blur,18);assert.equal(last.blur,0);}
  }
});

test('staggered presets hold their opening pose and keyframe snapshots include effects and 3D rotation',()=>{
  const project=createProject('blank'),a=addNode(project,'mesh'),b=addNode(project,'mesh');
  applyMotionPreset(project,[a.id,b.id],'fadeIn',{startFrame:5,durationFrames:30,stagger:10});
  const second=project.nodes[1];assert.equal(evaluateNode(second,14).opacity,0);assert.equal(evaluateNode(second,45).opacity,1);
  Object.assign(second,{rotationX:22,rotationY:45,z:80,blur:4,glow:12});
  const snapshot=addKeyframe(project,second.id,70);
  for(const prop of ['rotationX','rotationY','z','blur','glow'])assert.equal(snapshot[prop],second[prop]);
});

test('presets preserve sampled unrelated tracks and existing timing at shared keyframes',()=>{
  for(const timing of [{easing:'linear'},{easing:'bezier',bezier:[.2,-.4,.7,1.6]}]){
    for(const preset of motionPresets){
      const project=createProject('blank'),node=addNode(project,preset.meshOnly?'mesh':'rect');
      node.keyframes=[{frame:0,rotation:0,...timing},{frame:30,rotation:90,...timing}];
      const expected=Array.from({length:61},(_,frame)=>evaluateNode(node,frame/2).rotation);
      applyMotionPreset(project,node.id,preset.id,{durationFrames:30});
      const changed=project.nodes[0];
      assert.deepEqual(Array.from({length:61},(_,frame)=>evaluateNode(changed,frame/2).rotation),expected,`${preset.id} preserved ${timing.easing} rotation`);
      const last=changed.keyframes.find(key=>key.frame===30);
      assert.equal(last.easing,timing.easing);
      if(timing.bezier)assert.deepEqual(last.bezier,timing.bezier);
      else assert.equal(Object.hasOwn(last,'bezier'),false);
    }
  }
});

test('motion presets and snapshot authoring honor locks and preset errors cannot partially mutate the document',()=>{
  const project=createProject('blank'),a=addNode(project),b=addNode(project);b.locked=true;
  const before=JSON.stringify(project);
  assert.throws(()=>applyMotionPreset(project,[a.id,b.id],'fadeIn'),/Unlock/);assert.equal(JSON.stringify(project),before);
  assert.equal(addKeyframe(project,b.id,10),undefined);assert.equal(JSON.stringify(project),before);
  assert.throws(()=>applyMotionPreset(project,a.id,'spin3d'),/3D layer/);
  assert.throws(()=>applyMotionPreset(project,a.id,'fadeIn',{startFrame:239}),/timeline/);
  assert.throws(()=>applyMotionPreset(project,a.id,'fadeIn',{durationFrames:Infinity}),/timing/);
  assert.equal(JSON.stringify(project),before);
});

test('presets reject a full layer without silently truncating its authored keys',()=>{
  const project=createProject('blank'),node=addNode(project);project.duration=2000;
  node.keyframes=Array.from({length:1000},(_,frame)=>({frame,rotation:frame,easing:'linear'}));
  const before=JSON.stringify(project);
  assert.throws(()=>applyMotionPreset(project,node.id,'fadeIn',{startFrame:1200,durationFrames:30}),/1,000 keyframe layer limit/);
  assert.equal(JSON.stringify(project),before);
});

test('mesh count and triangle budgets reject aggregate geometry amplification',()=>{
  const project=createProject('blank');
  project.nodes=Array.from({length:MAX_MESHES+1},(_,i)=>({id:`box${i}`,type:'mesh',primitive:'box'}));
  assert.throws(()=>validateProject(project),/32 3D layers/);
  project.nodes=Array.from({length:Math.floor(MAX_MESH_TRIANGLES/MESH_TRIANGLES.torus)+1},(_,i)=>({id:`torus${i}`,type:'mesh',primitive:'torus'}));
  assert.throws(()=>validateProject(project),/4096 3D triangles/);
});

test('3D SVG export preserves actual geometry, animated effects and blend modes',()=>{
  const project=createProject('blank'),mesh=addNode(project,'mesh');
  project.duration=12;mesh.primitive='torus';mesh.blendMode='screen';
  mesh.keyframes=[{frame:0,rotationY:0,blur:18,glow:0},{frame:11,rotationY:180,blur:0,glow:12,easing:'linear'}];
  const svg=animatedSVG(project);
  assert.equal((svg.match(/data-mesh-frame=/g)||[]).length,12);
  assert.ok((svg.match(/<path /g)||[]).length>12);
  assert.match(svg,/attributeName="display"/);assert.match(svg,/attributeName="stdDeviation"/);assert.match(svg,/attributeName="flood-opacity"/);
  assert.match(svg,/mix-blend-mode:screen/);assert.doesNotMatch(svg,/NaN|Infinity|<script/);
  assert.notEqual(sceneToSVG(project,0),sceneToSVG(project,11));
  const positionOnly=validateProject(project);positionOnly.nodes[0].keyframes=[{frame:0,x:0},{frame:11,x:100}];
  assert.doesNotMatch(animatedSVG(positionOnly),/data-mesh-frame=/);
});

test('3D export budgets fail before sampling excessive geometry',()=>{
  const project=createProject('blank'),mesh=addNode(project,'mesh');
  mesh.primitive='torus';project.duration=2000;mesh.keyframes=[{frame:0,rotationY:0},{frame:1999,rotationY:360}];
  assert.throws(()=>animatedSVG(project),/triangle-frame export budget/);
  project.duration=600;mesh.keyframes[1].frame=599;
  assert.throws(()=>animatedSVG(project),/16 MB output budget/);
  const hero=animatedSVG(createProject('dimension'));
  assert.ok(Buffer.byteLength(hero)<16_000_000);assert.ok(hero.includes('data-mesh-frame='));
});

test('effect allocation budgets reject pathological text, dimensions, scene totals and near-camera geometry',()=>{
  const project=createProject('blank'),node=addNode(project,'text');
  node.text='x'.repeat(5000);node.fontSize=1000;node.glow=1;
  assert.throws(()=>validateProject(project),/16 million pixel filter budget/);
  Object.assign(node,{text:'A',fontSize:48,width:100,height:100,glow:0});
  node.keyframes=[{frame:0,width:100,glow:0},{frame:30,width:10000,height:10000,glow:1}];
  assert.throws(()=>validateProject(project),/filter budget/);
  node.keyframes=[];node.glow=1;
  project.nodes=Array.from({length:65},(_,index)=>({...node,id:`effect${index}`}));
  assert.throws(()=>validateProject(project),/64 layers with blur or glow/);
  project.nodes=Array.from({length:4},(_,index)=>({...node,id:`effect${index}`,width:3000,height:3000}));
  assert.throws(()=>validateProject(project),/32 million pixel filter budget/);
  project.nodes=[normalizeNode({id:'mesh',type:'mesh',width:1500,height:1500,glow:1})];
  assert.throws(()=>validateProject(project),/camera safety region/);
  project.nodes[0].glow=0;assert.equal(validateProject(project).nodes.length,1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { ANIMATED_PROPERTIES, CAMERA_PROPERTIES, createProject, addNode, normalizeNode, normalizeCamera, validateProject, serializeProject, parseProject, evaluateNode, evaluateCamera, addCameraKeyframe, keyframeTiming, setKeyframeTiming, filterSceneBounds } from '../web/core/model.js';
import { applyMotionPreset } from '../web/core/motion.js';
import { meshPaths } from '../web/core/three-svg.js';

test('legacy version one motion retains default timing and cameras gain an empty track',()=>{
  const project=validateProject({version:1,nodes:[{id:'legacy',rotation:0,opacity:0,keyframes:[{frame:0,rotation:0,opacity:0},{frame:30,rotation:90,opacity:1,easing:'linear'}]}]});
  const sample=evaluateNode(project.nodes[0],15);
  assert.equal(sample.rotation,45);assert.equal(sample.opacity,.5);
  assert.deepEqual(project.camera,{yaw:0,pitch:0,distance:800,fov:45,keyframes:[]});
  assert.deepEqual(evaluateCamera(project.camera,90),{yaw:0,pitch:0,distance:800,fov:45});
  assert.equal(project.version,1);assert.equal(Object.hasOwn(project.nodes[0].keyframes[1],'curves'),false);
  assert.deepEqual(parseProject(serializeProject(project)),project);
});

test('independent property timing changes one track without changing any samples of another',()=>{
  const node=normalizeNode({id:'independent',rotation:0,opacity:0,keyframes:[{frame:0,rotation:0,opacity:0},{frame:30,rotation:90,opacity:1,easing:'linear'}]});
  const expected=Array.from({length:121},(_,index)=>evaluateNode(node,index/4).rotation);
  const key=node.keyframes[1];setKeyframeTiming(key,'opacity',{easing:'easeOut'});
  assert.equal(evaluateNode(node,15).opacity,.75);assert.equal(evaluateNode(node,15).rotation,45);
  assert.deepEqual(Array.from({length:121},(_,index)=>evaluateNode(node,index/4).rotation),expected);
  setKeyframeTiming(key,'opacity',{easing:'bezier',bezier:[.16,1,.3,1]});
  assert.ok(evaluateNode(node,15).opacity>.9);assert.equal(evaluateNode(node,15).rotation,45);
  const copy=keyframeTiming(key,'opacity');copy.bezier[1]=-2;
  assert.equal(key.curves.opacity.bezier[1],1);
  setKeyframeTiming(key,'all',{easing:'linear'});
  assert.equal(Object.hasOwn(key,'curves'),false);assert.equal(Object.hasOwn(key,'bezier'),false);assert.equal(evaluateNode(node,15).opacity,.5);
});

test('presets author their own property curves while preserving default and unrelated override timing',()=>{
  const project=createProject('blank'),node=addNode(project);
  node.keyframes=[{frame:0,rotation:0,opacity:1,x:0},{frame:30,rotation:90,opacity:1,x:100,easing:'linear',curves:{x:{easing:'easeIn'}}}];
  const before=Array.from({length:61},(_,index)=>{const n=evaluateNode(node,index/2);return [n.rotation,n.x];});
  applyMotionPreset(project,node.id,'fadeIn',{durationFrames:30});
  const changed=project.nodes[0],last=changed.keyframes.find(key=>key.frame===30);
  assert.deepEqual(keyframeTiming(last,'opacity'),{easing:'easeOut'});
  assert.deepEqual(keyframeTiming(last,'rotation'),{easing:'linear'});
  assert.deepEqual(keyframeTiming(last,'x'),{easing:'easeIn'});
  assert.equal(evaluateNode(changed,15).opacity,.75);
  assert.deepEqual(Array.from({length:61},(_,index)=>{const n=evaluateNode(changed,index/2);return [n.rotation,n.x];}),before);
});

test('timing normalization drops active and prototype fields and bounds independent Bezier handles',()=>{
  const key=JSON.parse('{"frame":30,"x":100,"opacity":1,"easing":"linear","curves":{"__proto__":{"polluted":true},"constructor":{"easing":"linear"},"opacity":{"easing":"bezier","bezier":[-4,-99,9,99],"onload":"alert(1)"},"x":{"easing":"javascript:evil()"},"rotationY":{"easing":"step"}}}');
  const node=normalizeNode({id:'untrusted',keyframes:[key]}),clean=node.keyframes[0];
  assert.deepEqual(clean.curves.opacity,{easing:'bezier',bezier:[0,-2,1,3]});
  assert.deepEqual(clean.curves.x,{easing:'easeInOut'});
  assert.equal(Object.hasOwn(clean.curves,'__proto__'),false);assert.equal(Object.hasOwn(clean.curves,'constructor'),false);assert.equal({}.polluted,undefined);
  assert.throws(()=>setKeyframeTiming(clean,'__proto__',{easing:'linear'}),/Unknown animated property/);
  assert.throws(()=>keyframeTiming(clean,'yaw'),/Unknown animated property/);
  assert.throws(()=>setKeyframeTiming(clean,'rotation',{easing:'linear'}),/Author a rotation keyframe/);
  assert.equal(Object.hasOwn(normalizeNode({id:'array',keyframes:[{frame:1,curves:[]}]}).keyframes[0],'curves'),false);
});

test('camera tracks interpolate independently of object tracks and clamp expressive overshoot',()=>{
  const camera=normalizeCamera({yaw:0,pitch:0,distance:1000,fov:60,keyframes:[{frame:0,yaw:0,pitch:0,distance:1000,fov:60},{frame:100,yaw:120,pitch:-120,distance:750,fov:25,easing:'bezier',bezier:[0,3,1,3]}]});
  const middle=evaluateCamera(camera,50);
  assert.equal(middle.yaw,180);assert.equal(middle.pitch,-180);assert.equal(middle.distance,500);assert.equal(middle.fov,20);
  for(let frame=0;frame<=200;frame++){
    const pose=evaluateCamera(camera,frame);assert.deepEqual(Object.keys(pose),CAMERA_PROPERTIES);
    assert.ok(pose.yaw>=-180&&pose.yaw<=180);assert.ok(pose.pitch>=-180&&pose.pitch<=180);
    assert.ok(pose.distance>=500&&pose.distance<=2000);assert.ok(pose.fov>=20&&pose.fov<=90);
  }
  assert.deepEqual(evaluateCamera(camera,200),{yaw:120,pitch:-120,distance:750,fov:25});
  const project=createProject('blank');project.camera=camera;
  assert.equal(project.nodes.length,0);assert.deepEqual(parseProject(serializeProject(project)).camera,camera);
});

test('camera authoring snapshots all properties, upserts exact frames, and preserves the base pose',()=>{
  const project=createProject('blank');
  const first=addCameraKeyframe(project,0,{yaw:-20,distance:1000},{easing:'linear'});
  assert.equal(first.pitch,0);assert.equal(first.fov,45);
  addCameraKeyframe(project,60,{yaw:20,distance:700},{easing:'linear'});
  assert.deepEqual(evaluateCamera(project.camera,30),{yaw:0,pitch:0,distance:850,fov:45});
  assert.equal(project.camera.yaw,0);assert.equal(project.camera.distance,800);
  addCameraKeyframe(project,60,{yaw:40},{easing:'bezier',bezier:[.2,0,.8,1]});
  assert.equal(project.camera.keyframes.length,2);assert.equal(project.camera.keyframes[1].distance,700);assert.equal(project.camera.keyframes[1].yaw,40);
  const before=JSON.stringify(project);
  assert.throws(()=>addCameraKeyframe(project,240),/within the composition timeline/);
  assert.throws(()=>addCameraKeyframe(project,30,{distance:Infinity}),/finite yaw/);
  assert.equal(JSON.stringify(project),before);
});

test('camera count, scene key count and property override count fail before unbounded normalization',()=>{
  const project=createProject('blank');
  project.camera.keyframes=Array.from({length:1001},(_,frame)=>({frame,yaw:0}));
  assert.throws(()=>validateProject(project),/1,000 keyframes/);
  project.camera.keyframes=project.camera.keyframes.slice(0,1000);
  project.nodes=Array.from({length:9},(_,index)=>({id:`node${index}`,keyframes:Array.from({length:1000},(_,frame)=>({frame,x:0}))}));
  assert.equal(validateProject(project).camera.keyframes.length,1000);
  project.nodes.push({id:'overflow',keyframes:[{frame:0,x:0}]});
  assert.throws(()=>validateProject(project),/10,000 keyframes, including camera keys/);
  project.camera.keyframes=[];
  const curves=Object.fromEntries(ANIMATED_PROPERTIES.slice(0,10).map(property=>[property,{easing:'linear'}]));
  project.nodes=Array.from({length:2},(_,index)=>({id:`timing${index}`,keyframes:Array.from({length:1000},(_,frame)=>({frame,x:0,curves}))}));
  assert.equal(validateProject(project).nodes.length,2);
  project.nodes.push({id:'overflow',keyframes:[{frame:0,x:0,curves:{x:{easing:'linear'}}}]});
  assert.throws(()=>validateProject(project),/20,000 property timing overrides/);
});

test('unsafe camera motion and overshooting independent dimensions reject without authoring partial poses',()=>{
  const project=createProject('blank'),node=addNode(project,'mesh');
  Object.assign(node,{primitive:'sphere',width:700,height:700,glow:1});
  project.camera.distance=1000;
  addCameraKeyframe(project,0,{distance:1000});
  const before=JSON.stringify(project);
  assert.throws(()=>addCameraKeyframe(project,60,{distance:750},{easing:'bezier',bezier:[0,3,1,3]}),/filter budget/);
  assert.equal(JSON.stringify(project),before);
  assert.throws(()=>addCameraKeyframe(project,60,{distance:500,fov:20}),/filter budget/);
  assert.equal(JSON.stringify(project),before);
  project.camera=normalizeCamera();Object.assign(node,{width:200,height:200});
  node.keyframes=[{frame:0,width:200},{frame:60,width:800,easing:'linear'}];
  assert.doesNotThrow(()=>validateProject(project));
  setKeyframeTiming(node.keyframes[1],'width',{easing:'bezier',bezier:[0,3,1,3]});
  assert.throws(()=>validateProject(project),/camera safety region/);
});

test('the authored camera envelope contains projected faces across animated object and camera motion',()=>{
  const project=createProject('blank'),node=addNode(project,'mesh');
  Object.assign(node,{primitive:'box',width:220,height:200,z:80,glow:3});
  node.keyframes=[{frame:0,rotationX:0,rotationY:-35,width:220},{frame:90,rotationX:100,rotationY:230,width:280,easing:'linear',curves:{width:{easing:'easeOut'}}}];
  project.camera=normalizeCamera({distance:1000,fov:60,keyframes:[{frame:0,yaw:-35,pitch:-15,distance:1000,fov:60},{frame:90,yaw:35,pitch:30,distance:650,fov:35,easing:'easeInOut'}]});
  const clean=validateProject(project),bounds=filterSceneBounds(clean.nodes[0],clean.camera);
  for(let frame=0;frame<=90;frame+=3){
    const paths=meshPaths(evaluateNode(clean.nodes[0],frame),evaluateCamera(clean.camera,frame));
    for(const face of paths){
      const coordinates=face.d.match(/-?\d+(?:\.\d+)?/g).map(Number);
      for(let index=0;index<coordinates.length;index+=2){assert.ok(coordinates[index]>=bounds.x&&coordinates[index]<=bounds.x+bounds.width);assert.ok(coordinates[index+1]>=bounds.y&&coordinates[index+1]<=bounds.y+bounds.height);}
    }
  }
});

test('optimized camera envelopes preserve raw normalization and react to mutations without stale caches',()=>{
  const node=normalizeNode({id:'bounds',type:'mesh',primitive:'box',width:100,height:100,glow:1});
  const camera={distance:NaN,fov:Infinity,keyframes:[
    {frame:90,distance:900,fov:40,easing:'bezier',bezier:[-9,2,9,-1]},
    {frame:0,distance:1000,fov:60},
    {frame:45,distance:Infinity,fov:'invalid',easing:'elastic'},
    {frame:45,distance:500,fov:20},
    {frame:NaN,distance:600,fov:30}
  ]};
  assert.deepEqual(filterSceneBounds(node,camera),filterSceneBounds(node,normalizeCamera(camera)));
  const mutable=normalizeCamera({distance:1000,fov:60,keyframes:[{frame:0,distance:1000,fov:60},{frame:30,distance:900,fov:50}]});
  const original=filterSceneBounds(node,mutable);
  mutable.keyframes[1].distance=600;mutable.keyframes[1].fov=25;
  const changed=filterSceneBounds(node,mutable);
  assert.ok(changed.width>original.width);assert.deepEqual(changed,filterSceneBounds(node,normalizeCamera(mutable)));
  assert.throws(()=>filterSceneBounds(node,{keyframes:[null]}),/Invalid camera keyframe/);
  assert.throws(()=>filterSceneBounds(node,{keyframes:Array.from({length:1001},()=>({frame:0}))}),/1,000 keyframes/);
});

test('Beyond provides a subtle camera track at every composition size without breaking its filter envelope',()=>{
  for(const size of ['web','square','story','banner','hd','a4','classic']){
    const project=createProject('dimension',size);
    assert.equal(project.camera.keyframes.length,3);
    assert.notEqual(evaluateCamera(project.camera,0).yaw,evaluateCamera(project.camera,120).yaw);
    assert.deepEqual(parseProject(serializeProject(project)),project);
  }
});

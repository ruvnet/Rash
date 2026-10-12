import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,normalizeNode,validateProject,filterSceneBounds} from '../web/core/model.js';
import {meshPaths,MESH_TRIANGLES,meshTriangleCount} from '../web/core/three-svg.js';
import {sceneToSVG,effectMarkup,effectFilter,groupStyle} from '../web/core/renderer.js';

const mesh=extra=>normalizeNode({id:'mesh-test',type:'mesh',primitive:'box',width:200,height:200,fill:'#ff6b35',rotationX:24,rotationY:36,...extra});

test('Three primitives produce deterministic finite bounded SVG triangle faces',()=>{
 assert.deepEqual(MESH_TRIANGLES,{box:12,sphere:168,torus:192,pyramid:6});
 for(const primitive of Object.keys(MESH_TRIANGLES)){
  const node=mesh({primitive}),faces=meshPaths(node);
  assert.ok(faces.length>0&&faces.length<=meshTriangleCount(primitive),`${primitive} face budget`);
  assert.deepEqual(faces,meshPaths(node),`${primitive} deterministic`);
  assert.equal(new Set(faces.map(face=>face.id)).size,faces.length);
  for(const face of faces){
   assert.match(face.d,/^M[-\d.]+ [-\d.]+L[-\d.]+ [-\d.]+L[-\d.]+ [-\d.]+Z$/);
   assert.match(face.fill,/^#[a-f0-9]{6}$/);
   assert.ok(!/NaN|Infinity/.test(face.d));
   assert.ok(face.d.match(/-?\d+(?:\.\d+)?/g).every(value=>Math.abs(Number(value))<1000));
  }
 }
});

test('object rotation, depth, and camera orbit alter projected geometry',()=>{
 const original=mesh(),baseline=meshPaths(original);
 for(const change of [{rotationX:82},{rotationY:100},{z:150}])assert.notDeepEqual(meshPaths({...original,...change}),baseline);
 for(const camera of [{yaw:40},{pitch:40},{distance:1200},{fov:75}])assert.notDeepEqual(meshPaths(original,camera),baseline);
 const maxX=faces=>Math.max(...faces.flatMap(face=>face.d.match(/-?\d+(?:\.\d+)?/g).filter((_,i)=>i%2===0).map(Number)));
 assert.ok(maxX(meshPaths(original,{distance:1500}))<maxX(meshPaths(original,{distance:800})), 'farther camera reduces apparent size');
});

test('all camera poles and adversarial numeric values remain finite',()=>{
 for(const pitch of [-180,-90,0,90,180])for(const yaw of [-180,-90,0,90,180]){
  const faces=meshPaths(mesh({primitive:'torus'}),{pitch,yaw});
  assert.ok(faces.length<=192);assert.ok(!/NaN|Infinity/.test(JSON.stringify(faces)));
 }
 const faces=meshPaths({primitive:'__proto__',width:Infinity,height:NaN,rotationX:NaN,rotationY:Infinity,z:Infinity,fill:'url(https://evil.test)',stroke:'url(https://evil.test)'},{distance:0,fov:Infinity,pitch:NaN});
 assert.ok(faces.length>0);assert.ok(!/NaN|Infinity|evil\.test/.test(JSON.stringify(faces)));
});

test('wireframe and alpha colors survive projection without unsafe SVG attributes',()=>{
 const faces=meshPaths(mesh({wireframe:true,fill:'#1234'}));
 assert.ok(faces.length>0);
 for(const face of faces){assert.equal(face.fill,'none');assert.equal(face.stroke,'#1234');assert.equal(face.fillOpacity,.267);assert.ok(face.strokeWidth>=.75);}
 const transparent=meshPaths(mesh({fill:'transparent'}));assert.ok(transparent.every(face=>face.fillOpacity===0));
});

test('static SVG shares projected geometry, styles, and bounded native effects',()=>{
 const project=createProject('blank');project.nodes=[mesh({blur:6,glow:10,blendMode:'screen'})];
 const clean=validateProject(project),svg=sceneToSVG(clean),faces=meshPaths(clean.nodes[0],clean.camera);
 assert.equal((svg.match(/data-face-id=/g)||[]).length,faces.length);
 assert.ok(faces.every(face=>svg.includes(`d="${face.d}"`)));
 assert.match(svg,/feGaussianBlur stdDeviation="6"/);assert.match(svg,/feDropShadow dx="0" dy="0" stdDeviation="10"/);
 assert.match(svg,/mix-blend-mode:screen/);assert.match(svg,/filter="url\(#rash-effect-mesh-test\)"/);
 assert.notEqual(sceneToSVG({...clean,camera:{...clean.camera,yaw:40}}),svg);
});

test('effect helpers block attribute injection and preserve effects that start at zero',()=>{
 const node=mesh({keyframes:[{frame:30,blur:4,glow:7}]});
 assert.equal(effectFilter(node),'url(#rash-effect-mesh-test)');
 assert.match(effectMarkup(node),/flood-opacity="0"/);
 assert.equal(effectFilter(mesh()),null);
 const unsafe={...node,id:'\" onload=\"evil()',fill:'url(https://evil.test)',blur:Infinity,glow:999,blendMode:'url(https://evil.test)'};
 assert.ok(!/https:| onload=|Infinity/.test(effectMarkup(unsafe,'prefix\" onload=\"')));
 assert.match(effectMarkup(unsafe),/stdDeviation="30"/);
 assert.equal(groupStyle(unsafe),'mix-blend-mode:normal');
});

test('live and export effect bounds share the validated animated geometry envelope',()=>{
 const node=mesh({glow:5,keyframes:[{frame:90,width:300,height:280,z:100,easing:'easeInOut'}]});
 const camera={yaw:40,pitch:25,distance:1100,fov:40},bounds=filterSceneBounds(node,camera),markup=effectMarkup(node,'test',camera);
 for(const [key,value]of Object.entries(bounds))assert.ok(markup.includes(`${key}="${Math.round(value*1000)/1000}"`));
 for(const z of [0,100])for(const rotationY of [0,30,90,180]){
  for(const face of meshPaths({...node,width:300,height:280,z,rotationY},camera)){
   const points=face.d.match(/-?\d+(?:\.\d+)?/g).map(Number);
   for(let i=0;i<points.length;i+=2){assert.ok(points[i]>=bounds.x&&points[i]<=bounds.x+bounds.width);assert.ok(points[i+1]>=bounds.y&&points[i+1]<=bounds.y+bounds.height);}
  }
 }
});

test('every frame of an overshooting filtered mesh retains its authored validated bounds',()=>{
 const project=createProject('blank');project.camera.distance=1600;project.duration=120;
 project.nodes=[mesh({width:200,height:160,glow:3,keyframes:[{frame:90,width:300,height:240,z:100,glow:8,easing:'bezier',bezier:[.25,-2,.75,3]}]})];
 const clean=validateProject(project),bounds=filterSceneBounds(clean.nodes[0],clean.camera);
 const expected=Object.entries(bounds).map(([key,value])=>`${key}="${Math.round(value*1000)/1000}"`);
 for(let frame=0;frame<clean.duration;frame++){
  const svg=sceneToSVG(clean,frame),filter=svg.match(/<filter[^>]*>/)[0];
  for(const attribute of expected)assert.ok(filter.includes(attribute),`Frame ${frame} changed the authored filter envelope: ${attribute}`);
  assert.ok(!/NaN|Infinity/.test(svg));
 }
});

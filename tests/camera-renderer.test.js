import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,normalizeNode,validateProject,evaluateCamera,evaluateNode,filterSceneBounds} from '../web/core/model.js';
import {meshPaths} from '../web/core/three-svg.js';
import {sceneToSVG} from '../web/core/renderer.js';
import {animatedSVG} from '../web/export/svg.js';

function cameraScene({duration=12,primitive='box',count=1}={}){
 const project=createProject('blank');project.duration=duration;
 project.camera={yaw:-25,pitch:0,distance:1000,fov:45,keyframes:[{frame:0,yaw:0,distance:1000,easing:'linear'},{frame:duration-1,yaw:70,distance:850,easing:'linear'}]};
 project.nodes=Array.from({length:count},(_,index)=>normalizeNode({id:`mesh${index}`,type:'mesh',primitive,width:140,height:140,x:180*index,rotationX:25,rotationY:20,fill:'#7defd2'}));
 return validateProject(project);
}
const paths=svg=>[...svg.matchAll(/<path\b[^>]*\sd="([^"]+)"/g)].map(match=>match[1]);
const expectedPaths=(project,node,frame)=>meshPaths(evaluateNode(node,frame),evaluateCamera(project.camera,frame)).map(face=>face.d);
const frameGroups=svg=>[...svg.matchAll(/<g data-mesh-frame="(\d+)"[^>]*>([\s\S]*?)<\/g>/g)].map(match=>({frame:Number(match[1]),paths:paths(match[2])}));

test('still SVG evaluates camera tracks even when all mesh nodes are static',()=>{
 const project=cameraScene(),node=project.nodes[0];
 assert.equal(node.keyframes.length,0);
 assert.notDeepEqual(expectedPaths(project,node,0),meshPaths(node,project.camera).map(face=>face.d),'Frame zero uses its authored camera key instead of the base pose');
 for(const frame of [0,5,11])assert.deepEqual(paths(sceneToSVG(project,frame)),expectedPaths(project,node,frame));
 assert.notDeepEqual(paths(sceneToSVG(project,0)),paths(sceneToSVG(project,11)));
 assert.deepEqual(paths(sceneToSVG(project,10000)),expectedPaths(project,node,11),'Still exports clamp camera and nodes to the same final frame');
 assert.deepEqual(paths(sceneToSVG(project,-20)),expectedPaths(project,node,0));
});

test('camera-only animated SVG samples every static mesh at the matching shared camera pose',()=>{
 const project=cameraScene({count:2}),groups=frameGroups(animatedSVG(project));
 assert.equal(groups.length,project.duration*project.nodes.length);
 for(const [nodeIndex,node]of project.nodes.entries())for(let frame=0;frame<project.duration;frame++){
  const group=groups[nodeIndex*project.duration+frame];
  assert.equal(group.frame,frame);assert.deepEqual(group.paths,expectedPaths(project,node,frame));
 }
 assert.notDeepEqual(groups[0].paths,groups[project.duration-1].paths);
});

test('camera and object geometry tracks combine without dropping either animation',()=>{
 const project=cameraScene();project.nodes[0].keyframes=[{frame:0,rotationY:0},{frame:11,rotationY:180,easing:'linear'}];
 const groups=frameGroups(animatedSVG(project));
 for(const frame of [0,5,11])assert.deepEqual(groups[frame].paths,expectedPaths(project,project.nodes[0],frame));
 assert.notDeepEqual(groups[5].paths,meshPaths(project.nodes[0],evaluateCamera(project.camera,5)).map(face=>face.d));
});

test('camera export work includes its keys before any frame or geometry sampling',()=>{
 const project=cameraScene({duration:2000});
 project.camera.keyframes=Array.from({length:1000},(_,frame)=>({frame,yaw:frame%160,easing:'linear'}));
 assert.throws(()=>animatedSVG(project),/evaluation budget/);
});

test('camera-only motion obeys layer, triangle-frame, and byte export budgets',()=>{
 assert.throws(()=>animatedSVG(cameraScene({duration:20000,count:32})),/500,000 layer-frame export budget/);
 assert.throws(()=>animatedSVG(cameraScene({duration:1100,primitive:'torus'})),/200,000 triangle-frame export budget/);
 assert.throws(()=>animatedSVG(cameraScene({duration:600,primitive:'torus'})),/16 MB output budget/);
});

test('camera tracks do not manufacture SVG animation for a scene with no meshes',()=>{
 const project=cameraScene();project.nodes[0]=normalizeNode({...project.nodes[0],type:'rect'});
 assert.equal(animatedSVG(project),sceneToSVG(project,0));
 project.nodes[0].type='mesh';project.camera.keyframes=[{frame:0},{frame:11}];
 assert.equal(animatedSVG(project),sceneToSVG(project,0),'A track with no camera values has no projection work');
});

test('camera animation and expressive timing retain the exact authored filter envelope',()=>{
 const project=cameraScene({duration:30});project.nodes[0].width=80;project.nodes[0].height=80;project.nodes[0].z=20;project.nodes[0].glow=4;
 project.camera={yaw:0,pitch:0,distance:1300,fov:65,keyframes:[{frame:29,yaw:100,pitch:25,distance:1000,fov:50,easing:'bezier',bezier:[.25,-2,.75,3]}]};
 const clean=validateProject(project),node=clean.nodes[0],bounds=filterSceneBounds(node,clean.camera);
 const attributes=Object.entries(bounds).map(([key,value])=>`${key}="${Math.round(value*1000)/1000}"`);
 const animatedFilter=animatedSVG(clean).match(/<filter\b[^>]*>/)[0];
 for(const attribute of attributes)assert.ok(animatedFilter.includes(attribute));
 for(let frame=0;frame<clean.duration;frame++){
  const svg=sceneToSVG(clean,frame),filter=svg.match(/<filter\b[^>]*>/)[0];
  for(const attribute of attributes)assert.ok(filter.includes(attribute),`Frame ${frame} changed the authored filter bound ${attribute}`);
  for(const d of paths(svg)){
   const points=d.match(/-?\d+(?:\.\d+)?/g).map(Number);
   for(let index=0;index<points.length;index+=2){assert.ok(points[index]>=bounds.x&&points[index]<=bounds.x+bounds.width);assert.ok(points[index+1]>=bounds.y&&points[index+1]<=bounds.y+bounds.height);}
  }
 }
});

test('independent property easing reaches both still attributes and portable animation samples',()=>{
 const project=createProject('blank');project.duration=11;
 project.nodes=[normalizeNode({id:'rect',type:'rect',width:100,height:100,opacity:0,keyframes:[{frame:10,rotation:90,opacity:1,easing:'linear',curves:{opacity:{easing:'easeOut'}}}]})];
 const still=sceneToSVG(project,5);assert.match(still,/opacity="0.75"/);assert.match(still,/rotate\(45 50 50\)/);
 const animated=animatedSVG(project),opacity=animated.match(/attributeName="opacity" values="([^"]+)"/)[1].split(';');
 const rotation=animated.match(/type="rotate" values="([^"]+)"/)[1].split(';');
 assert.equal(Number(opacity[5]),.75);assert.equal(rotation[5],'45 50 50');
});
